/*
Licensed to the Apache Software Foundation (ASF) under one or more
contributor license agreements.  See the NOTICE file distributed with
this work for additional information regarding copyright ownership.
The ASF licenses this file to You under the Apache License, Version 2.0
(the "License"); you may not use this file except in compliance with
the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package service

import (
	"strings"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/core/models/domainlayer/crossdomain"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	logmocks "github.com/apache/incubator-devlake/mocks/core/log"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
	collectorlogs "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	logsv1 "go.opentelemetry.io/proto/otlp/logs/v1"
	resourcev1 "go.opentelemetry.io/proto/otlp/resource/v1"
)

const otherOrganizationID = "11111111-2222-4333-8444-555555555555"

// replaceAttribute sets key to value, dropping any earlier value.
func replaceAttribute(attributes []*commonv1.KeyValue, key, value string) []*commonv1.KeyValue {
	return append(removeAttribute(attributes, key), stringAttribute(key, value))
}

// claimsStatus reports whether a log batch claim condition selects the given status.
func claimsStatus(argument interface{}, status string) bool {
	params := whereParams(argument)
	return len(params) > 0 && params[0] == status
}

// whereParams returns a where clause's parameters, or nil for any other argument.
func whereParams(argument interface{}) []interface{} {
	clause, ok := argument.(dal.Clause)
	if !ok {
		return nil
	}
	where, ok := clause.Data.(dal.DalClause)
	if !ok {
		return nil
	}
	return where.Params
}

// The whole path to ai_prompts: a real-shaped request is sanitized and stored at ingest,
// decoded and prepared by the converter, and summed into one prompt row.
func TestPromptFlowFromIngestToCanonicalPrompt(t *testing.T) {
	common := func(eventName string, extra ...*commonv1.KeyValue) *logsv1.LogRecord {
		attributes := []*commonv1.KeyValue{
			stringAttribute(devlakeTeamAttribute, "platform"),
			stringAttribute(organizationIDAttribute, testOrganizationID),
			stringAttribute("user.account_id", "user_1"),
			stringAttribute("user.email", "dev@example.com"),
			stringAttribute(sessionIDAttribute, "session-a"),
			stringAttribute(promptIDAttribute, "prompt-1"),
		}
		return newLogRecord(eventName, append(attributes, extra...)...)
	}
	userPrompt := common("user_prompt", stringAttribute("prompt", "<REDACTED>"), intAttribute("prompt_length", 42))
	apiRequest := common("api_request", stringAttribute("model", "claude-opus-5-5"), doubleAttribute("cost_usd", 0.25),
		intAttribute("input_tokens", 10), intAttribute("output_tokens", 20), intAttribute("duration_ms", 900),
		stringAttribute("response", "model output"))
	apiRequest.TimeUnixNano += uint64(2 * time.Second)
	toolResult := common("tool_result", stringAttribute("tool_name", "Bash"), boolAttribute("success", true),
		intAttribute("duration_ms", 300), stringAttribute("tool_input", "rm -rf /tmp/x"))
	toolResult.TimeUnixNano += uint64(5 * time.Second)
	editDecision := common("tool_decision", stringAttribute("tool_name", "Edit"), stringAttribute("decision", "accept"))
	editDecision.TimeUnixNano += uint64(6 * time.Second)
	// Claude Code also emits events DevLake does not convert; ingest drops them.
	unsupported := common("hook_execution")

	_, stored := ingestAndCapture(t, newOtelLogsRequest([]*logsv1.LogRecord{userPrompt, apiRequest, toolResult, editDecision, unsupported}))
	converter, _ := boundConverter(t)
	prepared, err := converter.prepareLogEvents(7, stored)
	if err != nil || len(prepared.updates) != 4 || prepared.skippedCount != 0 {
		t.Fatalf("prepareLogEvents() = %+v, %v, want the four supported events", prepared, err)
	}
	targets := promptTargets(prepared.updates)
	if len(targets) != 1 {
		t.Fatalf("promptTargets() = %+v, want one prompt", targets)
	}
	events := make([]*models.OtelPromptEvent, 0, len(prepared.updates))
	for _, update := range prepared.updates {
		events = append(events, update.event)
	}

	got := canonicalPrompt(targets[0], events)

	if got.WorkspaceKey != testOrganizationID || got.UserKey != "acct:user_1" || got.UserAccountId == nil || *got.UserAccountId != "user_1" ||
		got.UserEmail != "dev@example.com" || got.SessionId != "session-a" || got.PromptId != "prompt-1" {
		t.Fatalf("identity = %+v", got)
	}
	if got.PromptLength != 42 || got.ApiRequests != 1 || got.Model != "claude-opus-5-5" || got.InputTokens != 10 || got.OutputTokens != 20 ||
		got.ApiDurationMs != 900 || got.EstimatedCostUsd != "0.25000000" {
		t.Fatalf("usage = %+v", got)
	}
	if got.ToolCalls != 1 || got.ToolSuccesses != 1 || got.ToolDurationMs != 300 || got.EditsAccepted != 1 || got.WallDurationMs != 6000 {
		t.Fatalf("effectiveness = %+v", got)
	}
	if got.SourceConnectionId == nil || *got.SourceConnectionId != 3 {
		t.Fatalf("SourceConnectionId = %v, want 3", got.SourceConnectionId)
	}
}

func TestCanonicalPromptSpansEventsReceivedOutOfOrder(t *testing.T) {
	events := []*models.OtelPromptEvent{
		promptEvent("api_request", 4*time.Second, nil),
		promptEvent("user_prompt", 0, nil),
		promptEvent("tool_result", 10*time.Second, nil),
		promptEvent("api_request", 2*time.Second, nil),
	}
	got := canonicalPrompt(testPromptTarget, events)
	start := time.Date(2026, 10, 12, 9, 0, 0, 0, time.UTC)
	if !got.StartedAt.Equal(start) || !got.EndedAt.Equal(start.Add(10*time.Second)) || got.WallDurationMs != 10_000 || !got.SourceUpdatedAt.Equal(got.EndedAt) {
		t.Fatalf("span = %v to %v (%d ms), want the earliest to the latest event", got.StartedAt, got.EndedAt, got.WallDurationMs)
	}
}

func TestCanonicalPromptKeepsTheFirstEmailAndLongestLength(t *testing.T) {
	email := "dev@example.com"
	events := []*models.OtelPromptEvent{
		// An event without email leaves it to later events.
		promptEvent("api_request", 0, nil),
		promptEvent("user_prompt", time.Second, func(e *models.OtelPromptEvent) {
			e.PromptLength, e.UserEmail = 17, &email
		}),
		promptEvent("user_prompt", 2*time.Second, func(e *models.OtelPromptEvent) {
			e.PromptLength, e.CommandName = 40, "review"
		}),
	}
	got := canonicalPrompt(testPromptTarget, events)
	if got.PromptLength != 40 || got.CommandName != "review" || got.UserEmail != email {
		t.Fatalf("prompt = length %d, command %q, email %q", got.PromptLength, got.CommandName, got.UserEmail)
	}
}

func TestCanonicalPromptCountsOnlyEditToolAcceptAndReject(t *testing.T) {
	decision := func(tool, decision string) *models.OtelPromptEvent {
		return promptEvent("tool_decision", 0, func(e *models.OtelPromptEvent) { e.ToolName, e.Decision = tool, decision })
	}
	events := []*models.OtelPromptEvent{
		decision("Edit", "accept"), decision("MultiEdit", "accept"), decision("Write", "reject"), decision("NotebookEdit", "reject"),
		// Other decisions and non-edit tools are not edit outcomes.
		decision("Edit", "abort"), decision("Edit", ""), decision("Read", "accept"), decision("Bash", "reject"),
	}
	got := canonicalPrompt(testPromptTarget, events)
	if got.EditsAccepted != 2 || got.EditsRejected != 2 || got.ToolCalls != 0 {
		t.Fatalf("edits = %d accepted, %d rejected, %d tool calls, want 2, 2, 0", got.EditsAccepted, got.EditsRejected, got.ToolCalls)
	}
}

func TestCanonicalPromptCountsRequestsWithoutAModel(t *testing.T) {
	got := canonicalPrompt(testPromptTarget, []*models.OtelPromptEvent{
		promptEvent("api_request", 0, func(e *models.OtelPromptEvent) { e.OutputTokens = 5 }),
		promptEvent("api_error", time.Second, func(e *models.OtelPromptEvent) { e.Model = "claude-opus-5-5" }),
	})
	if got.ApiRequests != 1 || got.ApiErrors != 1 || got.OutputTokens != 5 || got.Model != "" {
		t.Fatalf("prompt = %d requests, %d errors, model %q, want an unnamed model left empty and errors not counted as served", got.ApiRequests, got.ApiErrors, got.Model)
	}
}

func TestCanonicalPromptFormatsCostToEightDecimals(t *testing.T) {
	for micros, want := range map[int64]string{0: "0.00000000", 5: "0.00000500", 1_000_000: "1.00000000", 12_345_678: "12.34567800"} {
		got := canonicalPrompt(testPromptTarget, []*models.OtelPromptEvent{
			promptEvent("api_request", 0, func(e *models.OtelPromptEvent) { e.CostUsdMicros = micros }),
		})
		if got.EstimatedCostUsd != want {
			t.Errorf("cost of %d micros = %s, want %s", micros, got.EstimatedCostUsd, want)
		}
	}
}

func TestCanonicalPromptIDSeparatesSessionsAndUsers(t *testing.T) {
	events := []*models.OtelPromptEvent{promptEvent("user_prompt", 0, nil)}
	base := canonicalPrompt(testPromptTarget, events).Id
	otherSession, otherUser := testPromptTarget, testPromptTarget
	otherSession.sessionID = "session-b"
	otherUser.userKey = "acct:user_2"
	if base == canonicalPrompt(otherSession, events).Id || base == canonicalPrompt(otherUser, events).Id {
		t.Fatal("the same prompt id in another session or from another user must be a different ai_prompts row")
	}
	if base != canonicalPrompt(testPromptTarget, events).Id {
		t.Fatal("rebuilding a prompt must keep its id so the row is updated in place")
	}
}

// expectStoredClaudeAccount returns an account that already matches, so no account write follows.
func expectStoredClaudeAccount(transaction *dalmocks.Transaction, email string) {
	transaction.On("First", mock.AnythingOfType("*crossdomain.Account"), mock.Anything).Run(func(args mock.Arguments) {
		account := args.Get(0).(*crossdomain.Account)
		account.Email, account.FullName = email, "Dev Name"
	}).Return(nil).Once()
}

func TestReconcileOtelPromptsLoadsEachPromptByItsFullKey(t *testing.T) {
	transaction := dalmocks.NewTransaction(t)
	var params []interface{}
	transaction.On("All", mock.AnythingOfType("*[]*models.OtelPromptEvent"), mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		params = whereParams(args.Get(2))
	}).Return(nil).Once()

	if err := reconcileOtelPrompts(transaction, []promptTarget{testPromptTarget}); err != nil {
		t.Fatalf("reconcileOtelPrompts() error = %v", err)
	}
	want := []interface{}{testOrganizationID, "acct:user_1", "session-a", "prompt-1"}
	if len(params) != len(want) {
		t.Fatalf("where params = %v, want %v", params, want)
	}
	for i := range want {
		if params[i] != want[i] {
			t.Fatalf("where params = %v, want %v", params, want)
		}
	}
}

func TestReconcileOtelPromptsResolvesEachAccountOnce(t *testing.T) {
	email := "dev@example.com"
	transaction := dalmocks.NewTransaction(t)
	transaction.On("All", mock.AnythingOfType("*[]*models.OtelPromptEvent"), mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		*args.Get(0).(*[]*models.OtelPromptEvent) = []*models.OtelPromptEvent{promptEvent("user_prompt", 0, func(e *models.OtelPromptEvent) { e.UserEmail = &email })}
	}).Return(nil).Twice()
	expectStoredClaudeAccount(transaction, email)
	written := make([]*ai.AiPrompt, 0)
	transaction.On("CreateOrUpdate", mock.AnythingOfType("*ai.AiPrompt")).Run(func(args mock.Arguments) {
		written = append(written, args.Get(0).(*ai.AiPrompt))
	}).Return(nil).Twice()
	second := testPromptTarget
	second.promptID = "prompt-2"

	if err := reconcileOtelPrompts(transaction, []promptTarget{testPromptTarget, second}); err != nil {
		t.Fatalf("reconcileOtelPrompts() error = %v", err)
	}
	if len(written) != 2 || written[0].PromptId != "prompt-1" || written[1].PromptId != "prompt-2" || written[0].AccountId != written[1].AccountId {
		t.Fatalf("written = %+v, want both prompts under one account", written)
	}
}

func TestReconcileOtelPromptsReturnsAccountError(t *testing.T) {
	transaction := dalmocks.NewTransaction(t)
	transaction.On("All", mock.AnythingOfType("*[]*models.OtelPromptEvent"), mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		*args.Get(0).(*[]*models.OtelPromptEvent) = []*models.OtelPromptEvent{promptEvent("user_prompt", 0, nil)}
	}).Return(nil).Once()
	lookupErr := errors.Default.New("connection lost")
	transaction.On("First", mock.AnythingOfType("*crossdomain.Account"), mock.Anything).Return(lookupErr).Once()
	transaction.On("IsErrorNotFound", lookupErr).Return(false).Once()

	if err := reconcileOtelPrompts(transaction, []promptTarget{testPromptTarget}); err == nil {
		t.Fatal("reconcileOtelPrompts() error = nil, want the account lookup failure and no prompt written")
	}
}

func TestReconcileOtelPromptsReturnsPromptWriteError(t *testing.T) {
	transaction := dalmocks.NewTransaction(t)
	transaction.On("All", mock.AnythingOfType("*[]*models.OtelPromptEvent"), mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		*args.Get(0).(*[]*models.OtelPromptEvent) = []*models.OtelPromptEvent{promptEvent("user_prompt", 0, nil)}
	}).Return(nil).Once()
	expectStoredClaudeAccount(transaction, "")
	transaction.On("CreateOrUpdate", mock.AnythingOfType("*ai.AiPrompt")).Return(errors.Default.New("disk full")).Once()

	err := reconcileOtelPrompts(transaction, []promptTarget{testPromptTarget})
	if err == nil || !strings.Contains(err.Error(), "write canonical Claude prompt") {
		t.Fatalf("reconcileOtelPrompts() error = %v, want the prompt write failure", err)
	}
}

func TestApplyPromptEventsBindsAnUnboundConnectionFirst(t *testing.T) {
	connection := &models.OtelConnection{}
	connection.ID = 3
	event := &models.OtelPromptEvent{Id: "e1", OrganizationId: testOrganizationID, UserKey: "acct:user_1", SessionId: "s1", PromptId: "p1"}
	transaction := dalmocks.NewTransaction(t)
	bind := transaction.On("UpdateColumns", mock.AnythingOfType("*models.OtelConnection"), mock.Anything, mock.Anything).Return(nil).Once()
	verify := transaction.On("First", mock.AnythingOfType("*models.OtelConnection"), mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		organizationID := testOrganizationID
		args.Get(0).(*models.OtelConnection).OrganizationId = &organizationID
	}).Return(nil).Once().NotBefore(bind)
	transaction.On("CreateIfNotExist", event).Return(nil).Once().NotBefore(verify)
	transaction.On("All", mock.AnythingOfType("*[]*models.OtelPromptEvent"), mock.Anything, mock.Anything, mock.Anything).Return(nil).Once()

	if err := applyPromptEvents(transaction, []promptEventUpdate{{event: event, connection: connection, organizationID: testOrganizationID}}); err != nil {
		t.Fatalf("applyPromptEvents() error = %v", err)
	}
}

func TestApplyPromptEventsStopsWhenTheConnectionWasBoundElsewhere(t *testing.T) {
	connection := &models.OtelConnection{}
	connection.ID = 3
	transaction := dalmocks.NewTransaction(t)
	transaction.On("UpdateColumns", mock.AnythingOfType("*models.OtelConnection"), mock.Anything, mock.Anything).Return(nil).Once()
	transaction.On("First", mock.AnythingOfType("*models.OtelConnection"), mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		organizationID := otherOrganizationID
		args.Get(0).(*models.OtelConnection).OrganizationId = &organizationID
	}).Return(nil).Once()

	err := applyPromptEvents(transaction, []promptEventUpdate{{event: &models.OtelPromptEvent{}, connection: connection, organizationID: testOrganizationID}})
	if code, permanent, _ := classifyConversionError(err); code != errorOrganizationMismatch || permanent {
		t.Fatalf("applyPromptEvents() error = %v, want a retryable organization_mismatch and no event stored", err)
	}
}

func TestApplyPromptEventsRebuildsAPromptOnceForManyEvents(t *testing.T) {
	organizationID := testOrganizationID
	connection := &models.OtelConnection{OrganizationId: &organizationID}
	event := func(id string) promptEventUpdate {
		return promptEventUpdate{
			event:      &models.OtelPromptEvent{Id: id, OrganizationId: testOrganizationID, UserKey: "acct:user_1", SessionId: "s1", PromptId: "p1"},
			connection: connection, organizationID: testOrganizationID,
		}
	}
	transaction := dalmocks.NewTransaction(t)
	transaction.On("CreateIfNotExist", mock.AnythingOfType("*models.OtelPromptEvent")).Return(nil).Times(3)
	transaction.On("All", mock.AnythingOfType("*[]*models.OtelPromptEvent"), mock.Anything, mock.Anything, mock.Anything).Return(nil).Once()

	if err := applyPromptEvents(transaction, []promptEventUpdate{event("e1"), event("e2"), event("e3")}); err != nil {
		t.Fatalf("applyPromptEvents() error = %v", err)
	}
}

func TestApplyPromptEventsReturnsPromptRebuildError(t *testing.T) {
	organizationID := testOrganizationID
	transaction := dalmocks.NewTransaction(t)
	transaction.On("CreateIfNotExist", mock.Anything).Return(nil).Once()
	transaction.On("All", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(errors.Default.New("connection lost")).Once()

	err := applyPromptEvents(transaction, []promptEventUpdate{{
		event:      &models.OtelPromptEvent{OrganizationId: testOrganizationID, PromptId: "p1"},
		connection: &models.OtelConnection{OrganizationId: &organizationID}, organizationID: testOrganizationID,
	}})
	if code, permanent, _ := classifyConversionError(err); err == nil || code != errorStorageFailure || permanent ||
		!strings.Contains(err.Error(), "write canonical Claude Code OTel prompts") {
		t.Fatalf("applyPromptEvents() error = %v, want a retryable prompt rebuild failure", err)
	}
}

func TestPrepareLogEventsSkipsEachUnattributableEventWithItsReason(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*logsv1.LogRecord)
		code   conversionErrorCode
	}{
		{"client project attribution", func(r *logsv1.LogRecord) {
			r.Attributes = append(r.Attributes, stringAttribute(devlakeProjectAttribute, "web"))
		}, errorInvalidAttribution},
		{"no timestamp", func(r *logsv1.LogRecord) { r.TimeUnixNano, r.ObservedTimeUnixNano = 0, 0 }, errorInvalidTimestamp},
		{"no organization", func(r *logsv1.LogRecord) { r.Attributes = removeAttribute(r.Attributes, organizationIDAttribute) }, errorMissingOrganization},
		{"malformed organization", func(r *logsv1.LogRecord) {
			r.Attributes = replaceAttribute(r.Attributes, organizationIDAttribute, "not-a-uuid")
		}, errorInvalidOrganization},
		{"another organization", func(r *logsv1.LogRecord) {
			r.Attributes = replaceAttribute(r.Attributes, organizationIDAttribute, otherOrganizationID)
		}, errorOrganizationMismatch},
		{"no user identity", func(r *logsv1.LogRecord) {
			r.Attributes = removeAttribute(removeAttribute(r.Attributes, "user.account_id"), "user.email")
		}, errorMissingUserIdentity},
		{"empty prompt id", func(r *logsv1.LogRecord) { r.Attributes = replaceAttribute(r.Attributes, promptIDAttribute, "") }, errorInvalidDimension},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			converter, _ := boundConverter(t)
			record := attributedRecord("api_request")
			testCase.mutate(record)

			prepared, err := converter.prepareLogEvents(42, logsRequest(record))
			if err != nil || len(prepared.updates) != 0 || prepared.skippedCount != 1 {
				t.Fatalf("prepareLogEvents() = %+v, %v, want the event skipped", prepared, err)
			}
			if !strings.HasPrefix(prepared.skipMessages[0], string(testCase.code)+": ") {
				t.Fatalf("skip message = %q, want code %s", prepared.skipMessages[0], testCase.code)
			}
		})
	}
}

func TestPrepareLogEventsCapsDiagnosticsButCountsEverySkip(t *testing.T) {
	converter, _ := boundConverter(t)
	records := make([]*logsv1.LogRecord, 0, maxResourceSkipDiagnostics+2)
	for i := 0; i < maxResourceSkipDiagnostics+2; i++ {
		record := attributedRecord("tool_result")
		record.Attributes = removeAttribute(record.Attributes, promptIDAttribute)
		records = append(records, record)
	}

	prepared, err := converter.prepareLogEvents(42, logsRequest(records...))
	if err != nil || prepared.skippedCount != maxResourceSkipDiagnostics+2 || len(prepared.skipMessages) != maxResourceSkipDiagnostics {
		t.Fatalf("prepared = %d skipped, %d messages, %v, want %d skipped and %d messages",
			prepared.skippedCount, len(prepared.skipMessages), err, maxResourceSkipDiagnostics+2, maxResourceSkipDiagnostics)
	}
	if !strings.HasPrefix(*prepared.diagnostic(), "skipped 7 event(s): ") {
		t.Fatalf("diagnostic = %q", *prepared.diagnostic())
	}
}

// Within one batch the first event's organization binds an unbound connection; a later
// event for another organization is skipped rather than rebinding it.
func TestPrepareLogEventsBindsAnUnboundConnectionToTheFirstOrganization(t *testing.T) {
	converter := converterWithConnection(t)
	other := attributedRecord("api_request")
	other.Attributes = replaceAttribute(other.Attributes, organizationIDAttribute, otherOrganizationID)

	prepared, err := converter.prepareLogEvents(42, logsRequest(attributedRecord("user_prompt"), other))
	if err != nil || len(prepared.updates) != 1 || prepared.skippedCount != 1 {
		t.Fatalf("prepareLogEvents() = %d events, %d skipped, %v, want 1 and 1", len(prepared.updates), prepared.skippedCount, err)
	}
	if prepared.updates[0].organizationID != testOrganizationID || !strings.HasPrefix(prepared.skipMessages[0], string(errorOrganizationMismatch)) {
		t.Fatalf("bound %q, skipped %v", prepared.updates[0].organizationID, prepared.skipMessages)
	}
}

func TestPrepareLogEventsReadsFallbacksForTimeSessionAndIdentity(t *testing.T) {
	converter, _ := boundConverter(t)
	record := attributedRecord("api_request")
	record.Attributes = removeAttribute(removeAttribute(record.Attributes, sessionIDAttribute), "user.account_id")
	record.Attributes = replaceAttribute(record.Attributes, promptIDAttribute, strings.Repeat("p", maxPromptIDLength))
	record.TimeUnixNano, record.ObservedTimeUnixNano = 0, testLogTime+uint64(time.Second)
	request := logsRequest(record)
	request.ResourceLogs[0].Resource = &resourcev1.Resource{Attributes: []*commonv1.KeyValue{stringAttribute(sessionIDAttribute, "resource-session")}}

	prepared, err := converter.prepareLogEvents(42, request)
	if err != nil || len(prepared.updates) != 1 {
		t.Fatalf("prepareLogEvents() = %+v, %v, want one event", prepared, err)
	}
	event := prepared.updates[0].event
	if !event.EventTime.Equal(time.Unix(0, int64(testLogTime)).Add(time.Second)) {
		t.Errorf("EventTime = %v, want the observed time", event.EventTime)
	}
	if event.SessionId != "resource-session" {
		t.Errorf("SessionId = %q, want the resource session", event.SessionId)
	}
	if event.UserKey != "email:dev@example.com" || event.UserAccountId != nil {
		t.Errorf("identity = %q, %v, want the email fallback without an account id", event.UserKey, event.UserAccountId)
	}
	if len(event.PromptId) != maxPromptIDLength {
		t.Errorf("PromptId length = %d, want a %d-character id accepted", len(event.PromptId), maxPromptIDLength)
	}
}

func TestPrepareLogEventsDropsAnOversizedSession(t *testing.T) {
	converter, _ := boundConverter(t)
	record := attributedRecord("api_request")
	record.Attributes = replaceAttribute(record.Attributes, sessionIDAttribute, strings.Repeat("s", maxSessionIDLength+1))

	prepared, err := converter.prepareLogEvents(42, logsRequest(record))
	if err != nil || len(prepared.updates) != 1 || prepared.updates[0].event.SessionId != "" {
		t.Fatalf("prepareLogEvents() = %+v, %v, want the event kept without its session", prepared, err)
	}
}

// The event id leaves out the batch, so the same event resent in another batch, or
// replayed, is stored once.
func TestPrepareLogEventsGivesAResentEventTheSameID(t *testing.T) {
	converter, _ := boundConverter(t)
	first, err := converter.prepareLogEvents(1, logsRequest(attributedRecord("tool_result", stringAttribute("tool_use_id", "toolu_1"))))
	if err != nil {
		t.Fatalf("prepareLogEvents() error = %v", err)
	}
	second, err := converter.prepareLogEvents(2, logsRequest(attributedRecord("tool_result", stringAttribute("tool_use_id", "toolu_1"))))
	if err != nil {
		t.Fatalf("prepareLogEvents() error = %v", err)
	}
	if first.updates[0].event.Id != second.updates[0].event.Id || first.updates[0].event.LogBatchId == second.updates[0].event.LogBatchId {
		t.Fatal("a resent event must keep its id across batches")
	}
}

func TestFillPromptEventFactsKeepsOnlyTheEventKindsFacts(t *testing.T) {
	refusal := &models.OtelPromptEvent{EventName: "api_refusal"}
	fillPromptEventFacts(refusal, []*commonv1.KeyValue{stringAttribute("model", "claude-opus-5-5"), intAttribute("duration_ms", 50)})
	if refusal.Model != "claude-opus-5-5" || refusal.DurationMs != 0 {
		t.Errorf("api_refusal facts = %+v, want the model only", refusal)
	}
	// Token and cost attributes on a tool result are not tool facts.
	result := &models.OtelPromptEvent{EventName: "tool_result"}
	fillPromptEventFacts(result, []*commonv1.KeyValue{stringAttribute("tool_name", "Bash"), intAttribute("input_tokens", 9), intAttribute("cost_usd_micros", 9)})
	if result.InputTokens != 0 || result.CostUsdMicros != 0 || result.Success != nil {
		t.Errorf("tool_result facts = %+v, want no usage and unknown success", result)
	}
	prompt := &models.OtelPromptEvent{EventName: "user_prompt"}
	fillPromptEventFacts(prompt, []*commonv1.KeyValue{intAttribute("prompt_length", 12)})
	if prompt.PromptLength != 12 {
		t.Errorf("user_prompt facts = %+v, want a length", prompt)
	}
}

func TestFillPromptEventFactsTruncatesLongFields(t *testing.T) {
	decision := &models.OtelPromptEvent{EventName: "tool_decision"}
	fillPromptEventFacts(decision, []*commonv1.KeyValue{
		stringAttribute("tool_name", strings.Repeat("t", 300)), stringAttribute("decision", strings.Repeat("d", 40)),
		stringAttribute("source", strings.Repeat("s", 80)),
	})
	if len(decision.ToolName) != maxEventFieldLength || len(decision.Decision) != 32 || len(decision.DecisionSource) != 64 {
		t.Fatalf("lengths = %d %d %d, want %d 32 64", len(decision.ToolName), len(decision.Decision), len(decision.DecisionSource), maxEventFieldLength)
	}
}

func TestConvertLogBatchReturnsCompletionWriteFailure(t *testing.T) {
	converter, database := boundConverter(t)
	transaction := dalmocks.NewTransaction(t)
	database.On("Begin").Return(transaction).Once()
	expectLeaseHeld(transaction)
	transaction.On("CreateIfNotExist", mock.Anything).Return(nil).Once()
	transaction.On("All", mock.AnythingOfType("*[]*models.OtelPromptEvent"), mock.Anything, mock.Anything, mock.Anything).Return(nil).Once()
	transaction.On("UpdateColumns", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Return(errors.Default.New("deadlock")).Once()
	transaction.On("Rollback").Return(nil).Once()

	_, err := converter.convertLogBatch(logBatch(t, 11, attributedRecord("api_request")), "owner")
	if code, permanent, _ := classifyConversionError(err); code != errorStorageFailure || permanent {
		t.Fatalf("convertLogBatch() error = %v, want a retryable storage_failure", err)
	}
}

func TestConvertLogBatchCompletesABatchWithOnlySkippedEvents(t *testing.T) {
	converter, database := boundConverter(t)
	noPrompt := attributedRecord("api_request")
	noPrompt.Attributes = removeAttribute(noPrompt.Attributes, promptIDAttribute)
	transaction := dalmocks.NewTransaction(t)
	database.On("Begin").Return(transaction).Once()
	expectLeaseHeld(transaction)
	var completion []dal.DalSet
	transaction.On("UpdateColumns", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		completion = args.Get(1).([]dal.DalSet)
	}).Return(nil).Once()
	transaction.On("Commit").Return(nil).Once()

	// No event or prompt is written: the mock fails on any CreateIfNotExist or All.
	if _, err := converter.convertLogBatch(logBatch(t, 11, noPrompt), "owner"); err != nil {
		t.Fatalf("convertLogBatch() error = %v", err)
	}
	if status, _ := setValue(completion, "status"); status != models.OtelMetricBatchStatusProcessed {
		t.Fatalf("status = %v, want processed so the batch is not retried", status)
	}
}

// expectCandidate makes the claim query for one condition find a batch, or nothing when id is 0.
func expectCandidate(database *dalmocks.Dal, claimed string, id uint64, status string) {
	call := database.On("First", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.MatchedBy(func(clause interface{}) bool {
		return claimsStatus(clause, claimed)
	}), mock.Anything)
	if id == 0 {
		call.Return(errors.NotFound.New("none")).Once()
		return
	}
	call.Run(func(args mock.Arguments) {
		candidate := args.Get(0).(*models.OtelLogBatch)
		candidate.ID, candidate.Status = id, status
	}).Return(nil).Once()
}

func TestClaimNextLogBatchClaimsTheOldestClaimableBatch(t *testing.T) {
	database := dalmocks.NewDal(t)
	database.On("IsErrorNotFound", mock.Anything).Return(true)
	expectCandidate(database, models.OtelMetricBatchStatusPending, 12, models.OtelMetricBatchStatusPending)
	expectCandidate(database, models.OtelMetricBatchStatusRetryableError, 0, "")
	// Batch 4's lease expired while processing, so it is older and claimed first.
	expectCandidate(database, models.OtelMetricBatchStatusProcessing, 4, models.OtelMetricBatchStatusProcessing)
	var claimParams []interface{}
	database.On("UpdateColumns", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		claimParams = whereParams(args.Get(2))
	}).Return(nil).Once()
	database.On("First", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything).Run(func(args mock.Arguments) {
		args.Get(0).(*models.OtelLogBatch).ID = 4
	}).Return(nil).Once()

	batch, _, err := newRawMetricConverter(database, nil).claimNextLogBatch()
	if err != nil || batch == nil || batch.ID != 4 {
		t.Fatalf("claimNextLogBatch() = %+v, %v, want batch 4", batch, err)
	}
	if len(claimParams) != 3 || claimParams[0] != uint64(4) || claimParams[1] != models.OtelMetricBatchStatusProcessing {
		t.Fatalf("claim params = %v, want batch 4 in its observed status", claimParams)
	}
}

func TestClaimNextLogBatchYieldsWhenAnotherWorkerClaimedFirst(t *testing.T) {
	database := dalmocks.NewDal(t)
	database.On("IsErrorNotFound", mock.Anything).Return(true)
	expectCandidate(database, models.OtelMetricBatchStatusPending, 12, models.OtelMetricBatchStatusPending)
	expectCandidate(database, models.OtelMetricBatchStatusRetryableError, 0, "")
	expectCandidate(database, models.OtelMetricBatchStatusProcessing, 0, "")
	database.On("UpdateColumns", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Return(nil).Once()
	// The guarded update matched nothing, so the batch is not loaded under this lease.
	database.On("First", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything).Return(errors.NotFound.New("none")).Once()

	batch, _, err := newRawMetricConverter(database, nil).claimNextLogBatch()
	if err != nil || batch != nil {
		t.Fatalf("claimNextLogBatch() = %+v, %v, want nothing claimed", batch, err)
	}
}

func TestClaimNextLogBatchReturnsClaimWriteError(t *testing.T) {
	database := dalmocks.NewDal(t)
	database.On("IsErrorNotFound", mock.Anything).Return(true)
	expectCandidate(database, models.OtelMetricBatchStatusPending, 12, models.OtelMetricBatchStatusPending)
	expectCandidate(database, models.OtelMetricBatchStatusRetryableError, 0, "")
	expectCandidate(database, models.OtelMetricBatchStatusProcessing, 0, "")
	database.On("UpdateColumns", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Return(errors.Default.New("deadlock")).Once()

	if batch, _, err := newRawMetricConverter(database, nil).claimNextLogBatch(); err == nil || batch != nil {
		t.Fatalf("claimNextLogBatch() = %+v, %v, want the claim failure", batch, err)
	}
}

func TestProcessNextLogBatchLeavesALostLeaseToItsNewOwner(t *testing.T) {
	converter, database := boundConverter(t)
	expectClaimOf(database, logBatch(t, 9, attributedRecord("api_request")))
	transaction := dalmocks.NewTransaction(t)
	database.On("Begin").Return(transaction).Once()
	transaction.On("First", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything, mock.Anything).Return(errors.NotFound.New("lease moved")).Once()
	transaction.On("Rollback").Return(nil).Once()

	// No failure is recorded: the mock fails on a second UpdateColumns.
	if progressed, err := converter.processNextLogBatch(); err != nil || !progressed {
		t.Fatalf("processNextLogBatch() = %t, %v, want progress without a failure write", progressed, err)
	}
}

func TestProcessNextLogBatchWarnsAboutSkippedEvents(t *testing.T) {
	converter, database := boundConverter(t)
	logger := logmocks.NewLogger(t)
	converter.logger = logger
	noPrompt := attributedRecord("api_request")
	noPrompt.Attributes = removeAttribute(noPrompt.Attributes, promptIDAttribute)
	expectClaimOf(database, logBatch(t, 9, noPrompt))
	transaction := dalmocks.NewTransaction(t)
	database.On("Begin").Return(transaction).Once()
	expectLeaseHeld(transaction)
	transaction.On("UpdateColumns", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Return(nil).Once()
	transaction.On("Commit").Return(nil).Once()
	logger.On("Warn", nil, mock.Anything, uint64(9), 1).Return().Once()

	if progressed, err := converter.processNextLogBatch(); err != nil || !progressed {
		t.Fatalf("processNextLogBatch() = %t, %v, want progress", progressed, err)
	}
}

func replayRequest(converter *rawMetricConverter) *models.OtelReplayRequest {
	return &models.OtelReplayRequest{RangeStart: converter.now().Add(-time.Hour), RangeEnd: converter.now()}
}

func TestReplayLogBatchesPagesPastAFullPage(t *testing.T) {
	converter, database := boundConverter(t)
	page := make([]*models.OtelLogBatch, 0, replayLogPageSize)
	for id := uint64(1); id <= replayLogPageSize; id++ {
		batch := &models.OtelLogBatch{PayloadProto: []byte("not protobuf")}
		batch.ID = id
		page = append(page, batch)
	}
	afterIDs := make([]interface{}, 0, 2)
	database.On("All", mock.AnythingOfType("*[]*models.OtelLogBatch"), mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		afterIDs = append(afterIDs, whereParams(args.Get(1))[0])
		if len(afterIDs) == 1 {
			*args.Get(0).(*[]*models.OtelLogBatch) = page
		}
	}).Return(nil).Twice()

	lastRenewal := converter.now()
	replayed, skipped, err := converter.replayLogBatches(replayRequest(converter), "owner", &lastRenewal, &replayDiagnostics{})
	if err != nil || replayed != 0 || skipped != replayLogPageSize {
		t.Fatalf("replayLogBatches() = %d, %d, %v, want undecodable batches skipped", replayed, skipped, err)
	}
	if len(afterIDs) != 2 || afterIDs[0] != uint64(0) || afterIDs[1] != uint64(replayLogPageSize) {
		t.Fatalf("pages started after ids %v, want 0 then %d", afterIDs, replayLogPageSize)
	}
}

func TestReplayLogBatchesReturnsPreparationError(t *testing.T) {
	database := dalmocks.NewDal(t)
	converter := newRawMetricConverter(database, nil)
	expectReplayPage(database, logBatch(t, 5, attributedRecord("api_request")))
	database.On("All", mock.AnythingOfType("*[]*models.OtelConnection"), mock.Anything).Return(errors.Default.New("connection lost")).Once()

	lastRenewal := converter.now()
	if replayed, _, err := converter.replayLogBatches(replayRequest(converter), "owner", &lastRenewal, &replayDiagnostics{}); err == nil || replayed != 0 {
		t.Fatalf("replayLogBatches() = %d, %v, want the connection lookup failure", replayed, err)
	}
}

func TestReplayLogBatchesRollsBackWhenEventsCannotBeStored(t *testing.T) {
	converter, database := boundConverter(t)
	expectReplayPage(database, logBatch(t, 5, attributedRecord("api_request")))
	transaction := dalmocks.NewTransaction(t)
	database.On("Begin").Return(transaction).Once()
	expectConverterLease(converter, transaction, converter.workerID)
	transaction.On("Delete", mock.AnythingOfType("*models.OtelPromptEvent"), mock.Anything).Return(nil).Once()
	transaction.On("CreateIfNotExist", mock.Anything).Return(errors.Default.New("disk full")).Once()
	transaction.On("Rollback").Return(nil).Once()

	lastRenewal := converter.now()
	if replayed, _, err := converter.replayLogBatches(replayRequest(converter), "owner", &lastRenewal, &replayDiagnostics{}); err == nil || replayed != 0 {
		t.Fatalf("replayLogBatches() = %d, %v, want the write failure", replayed, err)
	}
}

func TestReplayLogBatchesRollsBackWhenStoredEventsCannotBeDeleted(t *testing.T) {
	converter, database := boundConverter(t)
	expectReplayPage(database, logBatch(t, 5, attributedRecord("api_request")))
	transaction := dalmocks.NewTransaction(t)
	database.On("Begin").Return(transaction).Once()
	expectConverterLease(converter, transaction, converter.workerID)
	transaction.On("Delete", mock.AnythingOfType("*models.OtelPromptEvent"), mock.Anything).Return(errors.Default.New("lock wait timeout")).Once()
	transaction.On("Rollback").Return(nil).Once()

	lastRenewal := converter.now()
	replayed, _, err := converter.replayLogBatches(replayRequest(converter), "owner", &lastRenewal, &replayDiagnostics{})
	if err == nil || replayed != 0 || !strings.Contains(err.Error(), "delete replayed") {
		t.Fatalf("replayLogBatches() = %d, %v, want the delete failure", replayed, err)
	}
}

func TestReplayLogBatchesReturnsCommitFailure(t *testing.T) {
	converter, database := boundConverter(t)
	expectReplayPage(database, logBatch(t, 5, attributedRecord("api_request")))
	transaction := dalmocks.NewTransaction(t)
	database.On("Begin").Return(transaction).Once()
	expectConverterLease(converter, transaction, converter.workerID)
	transaction.On("Delete", mock.AnythingOfType("*models.OtelPromptEvent"), mock.Anything).Return(nil).Once()
	transaction.On("CreateIfNotExist", mock.Anything).Return(nil).Once()
	transaction.On("All", mock.AnythingOfType("*[]*models.OtelPromptEvent"), mock.Anything, mock.Anything, mock.Anything).Return(nil).Once()
	transaction.On("Commit").Return(errors.Default.New("deadlock")).Once()

	lastRenewal := converter.now()
	replayed, _, err := converter.replayLogBatches(replayRequest(converter), "owner", &lastRenewal, &replayDiagnostics{})
	if err == nil || replayed != 0 || !strings.Contains(err.Error(), "log batch 5 replay") {
		t.Fatalf("replayLogBatches() = %d, %v, want the commit failure", replayed, err)
	}
}

func TestReplayLogBatchesStopsWhenTheReplayLeaseCannotBeRenewed(t *testing.T) {
	converter, database := boundConverter(t)
	expectReplayPage(database, logBatch(t, 5, attributedRecord("api_request")))
	database.On("UpdateColumn", mock.AnythingOfType("*models.OtelReplayRequest"), "lease_until", mock.Anything, mock.Anything).Return(errors.Default.New("connection lost")).Once()

	// A zero last renewal makes the renewal due before the first batch.
	var lastRenewal time.Time
	if replayed, _, err := converter.replayLogBatches(replayRequest(converter), "owner", &lastRenewal, &replayDiagnostics{}); err == nil || replayed != 0 {
		t.Fatalf("replayLogBatches() = %d, %v, want the renewal failure before any batch", replayed, err)
	}
}

func TestSanitizeOtelLogsRequestRejectsAnEmptyRequest(t *testing.T) {
	if _, _, err := sanitizeOtelLogsRequest(&collectorlogs.ExportLogsServiceRequest{}); err == nil {
		t.Fatal("sanitizeOtelLogsRequest() error = nil, want a bad input for no resource logs")
	}
}

func TestLogObservedTimeRangeSpansResourcesAndSkipsUntimedRecords(t *testing.T) {
	early, late := testLogTime, testLogTime+uint64(time.Hour)
	resources := []*logsv1.ResourceLogs{
		{Resource: &resourcev1.Resource{}, ScopeLogs: []*logsv1.ScopeLogs{{LogRecords: []*logsv1.LogRecord{{TimeUnixNano: late}, {}}}}},
		{Resource: &resourcev1.Resource{}, ScopeLogs: []*logsv1.ScopeLogs{{LogRecords: []*logsv1.LogRecord{{ObservedTimeUnixNano: early}}}}},
	}
	minAt, maxAt := logObservedTimeRange(resources)
	if minAt == nil || maxAt == nil || !minAt.Equal(time.Unix(0, int64(early))) || !maxAt.Equal(time.Unix(0, int64(late))) {
		t.Fatalf("range = %v to %v, want %v to %v", minAt, maxAt, time.Unix(0, int64(early)), time.Unix(0, int64(late)))
	}
	if minAt, maxAt := logObservedTimeRange([]*logsv1.ResourceLogs{{ScopeLogs: []*logsv1.ScopeLogs{{LogRecords: []*logsv1.LogRecord{{}}}}}}); minAt != nil || maxAt != nil {
		t.Fatal("a batch with no timed record must have no observed range")
	}
}
