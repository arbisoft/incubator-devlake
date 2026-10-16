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
	"math"
	"strings"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
	collectorlogs "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	logsv1 "go.opentelemetry.io/proto/otlp/logs/v1"
	resourcev1 "go.opentelemetry.io/proto/otlp/resource/v1"
)

func intAttribute(key string, value int64) *commonv1.KeyValue {
	return &commonv1.KeyValue{Key: key, Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_IntValue{IntValue: value}}}
}

func doubleAttribute(key string, value float64) *commonv1.KeyValue {
	return &commonv1.KeyValue{Key: key, Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_DoubleValue{DoubleValue: value}}}
}

func boolAttribute(key string, value bool) *commonv1.KeyValue {
	return &commonv1.KeyValue{Key: key, Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_BoolValue{BoolValue: value}}}
}

// attributedRecord is a stored event as the Collector forwards it: trusted team, the
// organization and user identity, the session and the prompt.
func attributedRecord(eventName string, extra ...*commonv1.KeyValue) *logsv1.LogRecord {
	attributes := []*commonv1.KeyValue{
		stringAttribute(eventNameAttribute, claudeCodeEventScope+eventName),
		stringAttribute(devlakeTeamAttribute, "platform"),
		stringAttribute(organizationIDAttribute, testOrganizationID),
		stringAttribute("user.account_id", "user_1"),
		stringAttribute("user.email", "Dev@Example.com"),
		stringAttribute(sessionIDAttribute, "session-a"),
		stringAttribute(promptIDAttribute, "prompt-1"),
		intAttribute("event.sequence", 5),
	}
	return &logsv1.LogRecord{TimeUnixNano: testLogTime, Attributes: append(attributes, extra...)}
}

func logsRequest(records ...*logsv1.LogRecord) *collectorlogs.ExportLogsServiceRequest {
	return &collectorlogs.ExportLogsServiceRequest{ResourceLogs: []*logsv1.ResourceLogs{{
		ScopeLogs: []*logsv1.ScopeLogs{{LogRecords: records}},
	}}}
}

func converterWithConnection(t *testing.T) *rawMetricConverter {
	t.Helper()
	database := dalmocks.NewDal(t)
	database.On("All", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		connection := &models.OtelConnection{TeamSlug: "platform"}
		connection.ID = 3
		connection.CreatedAt = time.Unix(0, int64(testLogTime)).Add(-time.Hour)
		*args.Get(0).(*[]*models.OtelConnection) = []*models.OtelConnection{connection}
	}).Return(nil).Maybe()
	return newRawMetricConverter(database, nil)
}

func TestAttributeNumberReadsEveryEncodingClaudeCodeUses(t *testing.T) {
	attrs := []*commonv1.KeyValue{
		intAttribute("int", 2), doubleAttribute("double", 0.0053), stringAttribute("string", " 81 "),
		stringAttribute("garbage", "n/a"), intAttribute("negative", -4), doubleAttribute("nan", math.NaN()),
		boolAttribute("bool", true),
	}
	for key, want := range map[string]float64{"int": 2, "double": 0.0053, "string": 81} {
		if got, ok := attributeNumber(attrs, key); !ok || got != want {
			t.Errorf("attributeNumber(%q) = %v, %t, want %v", key, got, ok, want)
		}
	}
	for _, key := range []string{"garbage", "negative", "nan", "bool", "missing"} {
		if _, ok := attributeNumber(attrs, key); ok {
			t.Errorf("attributeNumber(%q) ok = true, want absent", key)
		}
	}
	if got := attributeInt64(attrs, "garbage"); got != 0 {
		t.Errorf("attributeInt64(garbage) = %d, want 0", got)
	}
}

func TestAttributeBoolReadsBoolAndString(t *testing.T) {
	attrs := []*commonv1.KeyValue{boolAttribute("bool", false), stringAttribute("string", "true"), stringAttribute("garbage", "maybe")}
	if got := attributeBool(attrs, "bool"); got == nil || *got {
		t.Errorf("attributeBool(bool) = %v, want false", got)
	}
	if got := attributeBool(attrs, "string"); got == nil || !*got {
		t.Errorf("attributeBool(string) = %v, want true", got)
	}
	if attributeBool(attrs, "garbage") != nil || attributeBool(attrs, "missing") != nil {
		t.Error("an unparseable or missing bool must be nil, not false")
	}
}

func TestCostUsdMicrosPrefersIntegerCost(t *testing.T) {
	if got := costUsdMicros([]*commonv1.KeyValue{intAttribute("cost_usd_micros", 5315), doubleAttribute("cost_usd", 0.0053148)}); got != 5315 {
		t.Errorf("costUsdMicros() = %d, want the integer value 5315", got)
	}
	if got := costUsdMicros([]*commonv1.KeyValue{doubleAttribute("cost_usd", 0.0053148)}); got != 5315 {
		t.Errorf("costUsdMicros() = %d, want 5315 rounded from cost_usd", got)
	}
	if got := costUsdMicros(nil); got != 0 {
		t.Errorf("costUsdMicros(nil) = %d, want 0", got)
	}
}

func TestFillPromptEventFactsByEventKind(t *testing.T) {
	cases := []struct {
		name  string
		attrs []*commonv1.KeyValue
		check func(*models.OtelPromptEvent) bool
	}{
		{"user_prompt", []*commonv1.KeyValue{stringAttribute("prompt_length", "63"), stringAttribute("command_name", "review")},
			func(e *models.OtelPromptEvent) bool {
				return e.PromptLength == 63 && e.CommandName == "review"
			}},
		{"api_request", []*commonv1.KeyValue{stringAttribute("model", "claude-opus-5-5"), intAttribute("duration_ms", 3753), intAttribute("input_tokens", 2),
			intAttribute("output_tokens", 74), intAttribute("cache_read_tokens", 19134), intAttribute("cache_creation_tokens", 7), intAttribute("cost_usd_micros", 5315)},
			func(e *models.OtelPromptEvent) bool {
				return e.Model == "claude-opus-5-5" && e.DurationMs == 3753 && e.InputTokens == 2 && e.OutputTokens == 74 &&
					e.CacheReadTokens == 19134 && e.CacheCreationTokens == 7 && e.CostUsdMicros == 5315
			}},
		{"api_error", []*commonv1.KeyValue{stringAttribute("model", "claude-opus-5-5"), stringAttribute("duration_ms", "120")},
			func(e *models.OtelPromptEvent) bool { return e.Model == "claude-opus-5-5" && e.DurationMs == 120 }},
		{"tool_result", []*commonv1.KeyValue{stringAttribute("tool_name", "Bash"), stringAttribute("success", "false"), stringAttribute("duration_ms", "81")},
			func(e *models.OtelPromptEvent) bool {
				return e.ToolName == "Bash" && e.Success != nil && !*e.Success && e.DurationMs == 81
			}},
		{"tool_decision", []*commonv1.KeyValue{stringAttribute("tool_name", "Edit"), stringAttribute("decision", "reject"), stringAttribute("source", "user_reject")},
			func(e *models.OtelPromptEvent) bool {
				return e.ToolName == "Edit" && e.Decision == "reject" && e.DecisionSource == "user_reject"
			}},
	}
	for _, testCase := range cases {
		event := &models.OtelPromptEvent{EventName: testCase.name}
		fillPromptEventFacts(event, testCase.attrs)
		if !testCase.check(event) {
			t.Errorf("%s facts = %+v", testCase.name, event)
		}
	}
}

func TestPromptEventIDIsStablePerEvent(t *testing.T) {
	event := &models.OtelPromptEvent{ConnectionId: 3, SessionId: "session-a", PromptId: "prompt-1", EventName: "tool_result", Sequence: 8, EventTime: time.Unix(0, int64(testLogTime))}
	attrs := []*commonv1.KeyValue{stringAttribute("tool_use_id", "toolu_1")}
	id := promptEventID(event, attrs)
	if len(id) != 64 || id != promptEventID(event, attrs) {
		t.Fatalf("promptEventID() = %q, want a stable 64-character hex id", id)
	}
	other := *event
	other.Sequence = 9
	if promptEventID(&other, attrs) == id || promptEventID(event, []*commonv1.KeyValue{stringAttribute("tool_use_id", "toolu_2")}) == id {
		t.Fatal("events differing in sequence or tool use must have different ids")
	}
}

func TestPrepareLogEventsConvertsAnAttributedEvent(t *testing.T) {
	converter := converterWithConnection(t)
	record := attributedRecord("api_request", intAttribute("input_tokens", 12), stringAttribute("model", "claude-opus-5-5"))

	prepared, err := converter.prepareLogEvents(42, logsRequest(record))
	if err != nil || len(prepared.updates) != 1 || prepared.skippedCount != 0 {
		t.Fatalf("prepareLogEvents() = %+v, %v, want one event", prepared, err)
	}
	event := prepared.updates[0].event
	if event.LogBatchId != 42 || event.ConnectionId != 3 || event.TeamSlug != "platform" || event.OrganizationId != testOrganizationID ||
		event.UserKey != "acct:user_1" || event.UserEmail == nil || *event.UserEmail != "dev@example.com" ||
		event.SessionId != "session-a" || event.PromptId != "prompt-1" || event.EventName != "api_request" ||
		event.Sequence != 5 || event.InputTokens != 12 || event.Model != "claude-opus-5-5" || len(event.Id) != 64 {
		t.Fatalf("event = %+v", event)
	}
	if prepared.diagnosticCode() != nil || prepared.diagnostic() != nil {
		t.Fatal("a batch with no skipped events must have no diagnostic")
	}
}

func TestPrepareLogEventsSkipsUnattributableEvents(t *testing.T) {
	converter := converterWithConnection(t)
	noPrompt := attributedRecord("api_request")
	noPrompt.Attributes = removeAttribute(noPrompt.Attributes, promptIDAttribute)
	noTeam := attributedRecord("api_request")
	noTeam.Attributes = removeAttribute(noTeam.Attributes, devlakeTeamAttribute)
	longPrompt := attributedRecord("api_request")
	longPrompt.Attributes = append(removeAttribute(longPrompt.Attributes, promptIDAttribute), stringAttribute(promptIDAttribute, strings.Repeat("p", maxPromptIDLength+1)))
	request := logsRequest(noPrompt, noTeam, longPrompt, attributedRecord("tool_result"))
	// A client-supplied team on the resource discards that whole resource.
	request.ResourceLogs = append(request.ResourceLogs, &logsv1.ResourceLogs{
		Resource:  &resourcev1.Resource{Attributes: []*commonv1.KeyValue{stringAttribute(devlakeTeamAttribute, "other")}},
		ScopeLogs: []*logsv1.ScopeLogs{{LogRecords: []*logsv1.LogRecord{attributedRecord("api_request")}}},
	})

	prepared, err := converter.prepareLogEvents(42, request)
	if err != nil {
		t.Fatalf("prepareLogEvents() error = %v", err)
	}
	if len(prepared.updates) != 1 || prepared.skippedCount != 4 || prepared.diagnosticCode() == nil || *prepared.diagnosticCode() != string(diagnosticEventsSkipped) {
		t.Fatalf("prepared = %d events, %d skipped (%v), want 1 converted and 4 skipped", len(prepared.updates), prepared.skippedCount, prepared.skipMessages)
	}
}

func TestPrepareLogEventsFailsOnConnectionLookupError(t *testing.T) {
	database := dalmocks.NewDal(t)
	database.On("All", mock.Anything, mock.Anything).Return(errors.Default.New("connection lost"))

	if _, err := newRawMetricConverter(database, nil).prepareLogEvents(42, logsRequest(attributedRecord("api_request"))); err == nil {
		t.Fatal("prepareLogEvents() error = nil, want the lookup failure so the batch is retried")
	}
}

func TestPromptTargetsDeduplicatePrompts(t *testing.T) {
	update := func(session, prompt string) promptEventUpdate {
		return promptEventUpdate{event: &models.OtelPromptEvent{OrganizationId: testOrganizationID, UserKey: "acct:user_1", SessionId: session, PromptId: prompt}}
	}
	targets := promptTargets([]promptEventUpdate{update("s1", "p1"), update("s1", "p1"), update("s1", "p2"), update("s2", "p1")})
	if len(targets) != 3 || targets[0].promptID != "p1" || targets[0].sessionID != "s1" {
		t.Fatalf("promptTargets() = %+v, want 3 sorted prompts", targets)
	}
}

func TestApplyPromptEventsStoresNewEventsAndRebuildsPrompts(t *testing.T) {
	organizationID := testOrganizationID
	connection := &models.OtelConnection{OrganizationId: &organizationID}
	event := &models.OtelPromptEvent{Id: "e1", OrganizationId: testOrganizationID, UserKey: "acct:user_1", SessionId: "s1", PromptId: "p1"}
	transaction := dalmocks.NewTransaction(t)
	// The connection is already bound to this organization, so binding writes nothing.
	transaction.On("CreateIfNotExist", event).Return(nil).Once()
	transaction.On("All", mock.AnythingOfType("*[]*models.OtelPromptEvent"), mock.Anything, mock.Anything, mock.Anything).Return(nil).Once()

	if err := applyPromptEvents(transaction, []promptEventUpdate{{event: event, connection: connection, organizationID: testOrganizationID}}); err != nil {
		t.Fatalf("applyPromptEvents() error = %v", err)
	}
}

func TestApplyPromptEventsReturnsEventWriteError(t *testing.T) {
	organizationID := testOrganizationID
	transaction := dalmocks.NewTransaction(t)
	transaction.On("CreateIfNotExist", mock.Anything).Return(errors.Default.New("disk full")).Once()

	err := applyPromptEvents(transaction, []promptEventUpdate{{event: &models.OtelPromptEvent{}, connection: &models.OtelConnection{OrganizationId: &organizationID}, organizationID: testOrganizationID}})
	if err == nil || !strings.Contains(err.Error(), "write Claude Code OTel prompt event") {
		t.Fatalf("applyPromptEvents() error = %v", err)
	}
}

func TestConvertLogBatchQuarantinesUndecodablePayload(t *testing.T) {
	converter := newRawMetricConverter(dalmocks.NewDal(t), nil)
	_, err := converter.convertLogBatch(&models.OtelLogBatch{PayloadProto: []byte("not protobuf")}, "owner")
	if code, permanent, _ := classifyConversionError(err); code != errorInvalidPayload || !permanent {
		t.Fatalf("convertLogBatch() error = %v, want a permanent invalid_payload", err)
	}
}

func TestClaimNextLogBatchDoesNotWaitBehindARetry(t *testing.T) {
	database := dalmocks.NewDal(t)
	converter := newRawMetricConverter(database, nil)
	notFound := errors.NotFound.New("none")
	database.On("IsErrorNotFound", notFound).Return(true)
	// No pending batch; batch 9 is a retry that is due; nothing is stuck in processing.
	database.On("First", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.MatchedBy(func(clause interface{}) bool {
		return claimsStatus(clause, models.OtelMetricBatchStatusPending)
	}), mock.Anything).Return(notFound).Once()
	database.On("First", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.MatchedBy(func(clause interface{}) bool {
		return claimsStatus(clause, models.OtelMetricBatchStatusRetryableError)
	}), mock.Anything).Run(func(args mock.Arguments) {
		batch := args.Get(0).(*models.OtelLogBatch)
		batch.ID, batch.Status, batch.AttemptCount = 9, models.OtelMetricBatchStatusRetryableError, 2
	}).Return(nil).Once()
	database.On("First", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.MatchedBy(func(clause interface{}) bool {
		return claimsStatus(clause, models.OtelMetricBatchStatusProcessing)
	}), mock.Anything).Return(notFound).Once()
	database.On("UpdateColumns", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Return(nil).Once()
	database.On("First", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything).Run(func(args mock.Arguments) {
		args.Get(0).(*models.OtelLogBatch).ID = 9
	}).Return(nil).Once()

	batch, owner, err := converter.claimNextLogBatch()
	if err != nil || batch == nil || batch.ID != 9 || owner == "" {
		t.Fatalf("claimNextLogBatch() = %+v, %q, %v, want batch 9", batch, owner, err)
	}
}

func removeAttribute(attributes []*commonv1.KeyValue, key string) []*commonv1.KeyValue {
	kept := make([]*commonv1.KeyValue, 0, len(attributes))
	for _, attribute := range attributes {
		if attribute.GetKey() != key {
			kept = append(kept, attribute)
		}
	}
	return kept
}

// clauseExpr returns a where clause's SQL, or "" for any other argument.
func clauseExpr(argument interface{}) string {
	clause, ok := argument.(dal.Clause)
	if !ok {
		return ""
	}
	where, ok := clause.Data.(dal.DalClause)
	if !ok {
		return ""
	}
	return where.Expr
}

func TestDeleteExpiredRawBatchesCoversLogBatches(t *testing.T) {
	database := dalmocks.NewDal(t)
	database.On("Pluck", "id", mock.Anything, mock.MatchedBy(func(clause dal.Clause) bool {
		_, logTable := clause.Data.(*models.OtelLogBatch)
		return clause.Type == dal.FromClause && logTable
	}), mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		*args.Get(1).(*[]uint64) = []uint64{4, 5}
	}).Return(nil).Once()
	database.On("Delete", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything).Return(nil).Once()

	if err := newRawMetricConverter(database, nil).deleteExpiredRawBatches(time.Now(), &models.OtelLogBatch{}); err != nil {
		t.Fatalf("deleteExpiredRawBatches() error = %v", err)
	}
}

func TestReplayLogBatchesWithNothingInRange(t *testing.T) {
	database := dalmocks.NewDal(t)
	database.On("All", mock.AnythingOfType("*[]*models.OtelLogBatch"), mock.MatchedBy(func(clause dal.Clause) bool {
		return strings.Contains(clauseExpr(clause), "max_observed_at >= ? AND min_observed_at < ?")
	}), mock.Anything, mock.Anything).Return(nil).Once()
	request := &models.OtelReplayRequest{RangeStart: time.Date(2026, 10, 10, 0, 0, 0, 0, time.UTC), RangeEnd: time.Date(2026, 10, 11, 0, 0, 0, 0, time.UTC)}

	var lastRenewal time.Time
	replayed, _, err := newRawMetricConverter(database, nil).replayLogBatches(request, "owner", &lastRenewal, &replayDiagnostics{})
	if err != nil || replayed != 0 {
		t.Fatalf("replayLogBatches() = %d, %v", replayed, err)
	}
}

// boundConverter resolves team "platform" to connection 3, already bound to the test
// organization, so conversion needs no binding writes.
func boundConverter(t *testing.T) (*rawMetricConverter, *dalmocks.Dal) {
	t.Helper()
	database := dalmocks.NewDal(t)
	database.On("All", mock.AnythingOfType("*[]*models.OtelConnection"), mock.Anything).Run(func(args mock.Arguments) {
		organizationID := testOrganizationID
		connection := &models.OtelConnection{TeamSlug: "platform", OrganizationId: &organizationID}
		connection.ID = 3
		connection.CreatedAt = time.Unix(0, int64(testLogTime)).Add(-time.Hour)
		*args.Get(0).(*[]*models.OtelConnection) = []*models.OtelConnection{connection}
	}).Return(nil).Maybe()
	converter := newRawMetricConverter(database, nil)
	now := time.Unix(0, int64(testLogTime)).Add(time.Minute).UTC()
	converter.now = func() time.Time { return now }
	return converter, database
}

func logBatch(t *testing.T, id uint64, records ...*logsv1.LogRecord) *models.OtelLogBatch {
	t.Helper()
	batch := &models.OtelLogBatch{PayloadProto: marshalLogs(t, logsRequest(records...)), AttemptCount: 1}
	batch.ID = id
	return batch
}

func setValue(sets []dal.DalSet, column string) (interface{}, bool) {
	for _, set := range sets {
		if set.ColumnName == column {
			return set.Value, true
		}
	}
	return nil, false
}

// expectLeaseHeld makes the lease check inside the conversion transaction succeed.
func expectLeaseHeld(transaction *dalmocks.Transaction) {
	transaction.On("First", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything, mock.Anything).Return(nil).Once()
}

func TestConvertLogBatchCommitsEventsPromptsAndCompletion(t *testing.T) {
	converter, database := boundConverter(t)
	transaction := dalmocks.NewTransaction(t)
	database.On("Begin").Return(transaction).Once()
	expectLeaseHeld(transaction)
	transaction.On("CreateIfNotExist", mock.MatchedBy(func(event *models.OtelPromptEvent) bool {
		return event.LogBatchId == 11 && event.EventName == "api_request" && event.InputTokens == 12
	})).Return(nil).Once()
	transaction.On("All", mock.AnythingOfType("*[]*models.OtelPromptEvent"), mock.Anything, mock.Anything, mock.Anything).Return(nil).Once()
	var completion []dal.DalSet
	transaction.On("UpdateColumns", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		completion = args.Get(1).([]dal.DalSet)
	}).Return(nil).Once()
	transaction.On("Commit").Return(nil).Once()

	prepared, err := converter.convertLogBatch(logBatch(t, 11, attributedRecord("api_request", intAttribute("input_tokens", 12))), "owner")
	if err != nil || len(prepared.updates) != 1 {
		t.Fatalf("convertLogBatch() = %+v, %v, want one event", prepared, err)
	}
	if status, _ := setValue(completion, "status"); status != models.OtelMetricBatchStatusProcessed {
		t.Fatalf("status = %v, want processed", status)
	}
	if code, _ := setValue(completion, "processing_error_code"); code.(*string) != nil {
		t.Fatalf("processing_error_code = %v, want nil for a clean batch", *code.(*string))
	}
	if processedAt, _ := setValue(completion, "processed_at"); !processedAt.(time.Time).Equal(converter.now()) {
		t.Fatalf("processed_at = %v, want %v", processedAt, converter.now())
	}
}

func TestConvertLogBatchRecordsSkippedEventsAsDiagnostic(t *testing.T) {
	converter, database := boundConverter(t)
	noPrompt := attributedRecord("tool_result")
	noPrompt.Attributes = removeAttribute(noPrompt.Attributes, promptIDAttribute)
	transaction := dalmocks.NewTransaction(t)
	database.On("Begin").Return(transaction).Once()
	expectLeaseHeld(transaction)
	transaction.On("CreateIfNotExist", mock.Anything).Return(nil).Once()
	transaction.On("All", mock.AnythingOfType("*[]*models.OtelPromptEvent"), mock.Anything, mock.Anything, mock.Anything).Return(nil).Once()
	var completion []dal.DalSet
	transaction.On("UpdateColumns", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		completion = args.Get(1).([]dal.DalSet)
	}).Return(nil).Once()
	transaction.On("Commit").Return(nil).Once()

	if _, err := converter.convertLogBatch(logBatch(t, 11, attributedRecord("api_request"), noPrompt), "owner"); err != nil {
		t.Fatalf("convertLogBatch() error = %v", err)
	}
	status, _ := setValue(completion, "status")
	code, _ := setValue(completion, "processing_error_code")
	message, _ := setValue(completion, "processing_error_message")
	if status != models.OtelMetricBatchStatusProcessed || code.(*string) == nil || *code.(*string) != string(diagnosticEventsSkipped) {
		t.Fatalf("status %v, code %v, want processed with events_skipped", status, code)
	}
	if text := *message.(*string); !strings.HasPrefix(text, "skipped 1 event(s): ") || !strings.Contains(text, "prompt.id") {
		t.Fatalf("processing_error_message = %q, want the skipped event's reason", text)
	}
}

func TestConvertLogBatchReportsLostLease(t *testing.T) {
	converter, database := boundConverter(t)
	transaction := dalmocks.NewTransaction(t)
	database.On("Begin").Return(transaction).Once()
	transaction.On("First", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything, mock.Anything).Return(errors.NotFound.New("lease moved")).Once()
	transaction.On("Rollback").Return(nil).Once()

	_, err := converter.convertLogBatch(logBatch(t, 11, attributedRecord("api_request")), "owner")
	if code, _, _ := classifyConversionError(err); code != errorLeaseLost {
		t.Fatalf("convertLogBatch() error = %v, want lease_lost", err)
	}
}

func TestConvertLogBatchRollsBackWhenAnEventCannotBeStored(t *testing.T) {
	converter, database := boundConverter(t)
	transaction := dalmocks.NewTransaction(t)
	database.On("Begin").Return(transaction).Once()
	expectLeaseHeld(transaction)
	transaction.On("CreateIfNotExist", mock.Anything).Return(errors.Default.New("disk full")).Once()
	transaction.On("Rollback").Return(nil).Once()

	_, err := converter.convertLogBatch(logBatch(t, 11, attributedRecord("api_request")), "owner")
	if _, permanent, _ := classifyConversionError(err); err == nil || permanent {
		t.Fatalf("convertLogBatch() error = %v, want a retryable storage failure", err)
	}
}

func TestConvertLogBatchReturnsCommitFailure(t *testing.T) {
	converter, database := boundConverter(t)
	transaction := dalmocks.NewTransaction(t)
	database.On("Begin").Return(transaction).Once()
	expectLeaseHeld(transaction)
	transaction.On("CreateIfNotExist", mock.Anything).Return(nil).Once()
	transaction.On("All", mock.AnythingOfType("*[]*models.OtelPromptEvent"), mock.Anything, mock.Anything, mock.Anything).Return(nil).Once()
	transaction.On("UpdateColumns", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Return(nil).Once()
	transaction.On("Commit").Return(errors.Default.New("deadlock")).Once()

	_, err := converter.convertLogBatch(logBatch(t, 11, attributedRecord("api_request")), "owner")
	if code, permanent, _ := classifyConversionError(err); code != errorStorageFailure || permanent {
		t.Fatalf("convertLogBatch() error = %v, want a retryable storage_failure", err)
	}
}

// expectClaimOf makes claimNextLogBatch find the pending batch and load it after claiming.
func expectClaimOf(database *dalmocks.Dal, batch *models.OtelLogBatch) {
	notFound := errors.NotFound.New("none")
	database.On("IsErrorNotFound", notFound).Return(true).Maybe()
	database.On("First", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.MatchedBy(func(clause interface{}) bool {
		return claimsStatus(clause, models.OtelMetricBatchStatusPending)
	}), mock.Anything).Run(func(args mock.Arguments) {
		candidate := args.Get(0).(*models.OtelLogBatch)
		candidate.ID, candidate.Status, candidate.AttemptCount = batch.ID, models.OtelMetricBatchStatusPending, 0
	}).Return(nil).Once()
	database.On("First", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything, mock.Anything).Return(notFound).Twice()
	database.On("UpdateColumns", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Return(nil).Once()
	database.On("First", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything).Run(func(args mock.Arguments) {
		*args.Get(0).(*models.OtelLogBatch) = *batch
	}).Return(nil).Once()
}

func TestProcessNextLogBatchQuarantinesUndecodableBatchInTheLogTable(t *testing.T) {
	converter, database := boundConverter(t)
	batch := &models.OtelLogBatch{PayloadProto: []byte("not protobuf"), AttemptCount: 1}
	batch.ID = 9
	expectClaimOf(database, batch)
	var failure []dal.DalSet
	database.On("UpdateColumns", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		failure = args.Get(1).([]dal.DalSet)
	}).Return(nil).Once()

	progressed, err := converter.processNextLogBatch()
	if err != nil || !progressed {
		t.Fatalf("processNextLogBatch() = %t, %v, want progress", progressed, err)
	}
	status, _ := setValue(failure, "status")
	code, _ := setValue(failure, "processing_error_code")
	if status != models.OtelMetricBatchStatusPermanentError || code != string(errorInvalidPayload) {
		t.Fatalf("failure status %v, code %v, want permanent_error invalid_payload", status, code)
	}
}

func TestProcessNextLogBatchSchedulesRetryForStorageFailure(t *testing.T) {
	converter, database := boundConverter(t)
	expectClaimOf(database, logBatch(t, 9, attributedRecord("api_request")))
	transaction := dalmocks.NewTransaction(t)
	database.On("Begin").Return(transaction).Once()
	expectLeaseHeld(transaction)
	transaction.On("CreateIfNotExist", mock.Anything).Return(errors.Default.New("disk full")).Once()
	transaction.On("Rollback").Return(nil).Once()
	var failure []dal.DalSet
	database.On("UpdateColumns", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		failure = args.Get(1).([]dal.DalSet)
	}).Return(nil).Once()

	if progressed, err := converter.processNextLogBatch(); err != nil || !progressed {
		t.Fatalf("processNextLogBatch() = %t, %v, want progress", progressed, err)
	}
	status, _ := setValue(failure, "status")
	nextAttempt, scheduled := setValue(failure, "next_attempt_at")
	if status != models.OtelMetricBatchStatusRetryableError || !scheduled || !nextAttempt.(time.Time).After(converter.now()) {
		t.Fatalf("failure status %v, next attempt %v, want a scheduled retry", status, nextAttempt)
	}
}

func TestProcessNextLogBatchIsIdleWithNothingToClaim(t *testing.T) {
	database := dalmocks.NewDal(t)
	notFound := errors.NotFound.New("none")
	database.On("IsErrorNotFound", notFound).Return(true)
	database.On("First", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything, mock.Anything).Return(notFound).Times(3)

	if progressed, err := newRawMetricConverter(database, nil).processNextLogBatch(); err != nil || progressed {
		t.Fatalf("processNextLogBatch() = %t, %v, want idle", progressed, err)
	}
}

func TestClaimNextLogBatchReturnsLookupError(t *testing.T) {
	database := dalmocks.NewDal(t)
	lookupErr := errors.Default.New("connection lost")
	database.On("IsErrorNotFound", lookupErr).Return(false)
	database.On("First", mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything, mock.Anything, mock.Anything).Return(lookupErr).Once()

	if _, _, err := newRawMetricConverter(database, nil).claimNextLogBatch(); err == nil {
		t.Fatal("claimNextLogBatch() error = nil, want the lookup failure")
	}
}

// expectReplayPage returns the batches as one replay page.
func expectReplayPage(database *dalmocks.Dal, batches ...*models.OtelLogBatch) {
	database.On("All", mock.AnythingOfType("*[]*models.OtelLogBatch"), mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		*args.Get(0).(*[]*models.OtelLogBatch) = batches
	}).Return(nil).Once()
}

func expectConverterLease(converter *rawMetricConverter, transaction *dalmocks.Transaction, owner string) {
	transaction.On("First", mock.AnythingOfType("*models.OtelConverterLease"), mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		lease := args.Get(0).(*models.OtelConverterLease)
		lease.Owner, lease.LeaseUntil = owner, converter.now().Add(time.Minute)
	}).Return(nil).Once()
}

func TestReplayLogBatchesRebuildsPromptsOfEachDecodableBatch(t *testing.T) {
	converter, database := boundConverter(t)
	undecodable := &models.OtelLogBatch{PayloadProto: []byte("not protobuf")}
	undecodable.ID = 4
	expectReplayPage(database, undecodable, logBatch(t, 5, attributedRecord("api_request")))
	transaction := dalmocks.NewTransaction(t)
	database.On("Begin").Return(transaction).Once()
	expectConverterLease(converter, transaction, converter.workerID)
	var stored *models.OtelPromptEvent
	transaction.On("CreateIfNotExist", mock.MatchedBy(func(event *models.OtelPromptEvent) bool { return event.LogBatchId == 5 })).Run(func(args mock.Arguments) {
		stored = args.Get(0).(*models.OtelPromptEvent)
	}).Return(nil).Once()
	// The stored copy is deleted first, so the re-derived event replaces it.
	var deleted []string
	transaction.On("Delete", mock.AnythingOfType("*models.OtelPromptEvent"), mock.MatchedBy(func(clause dal.Clause) bool {
		return clauseExpr(clause) == "id IN ?"
	})).Run(func(args mock.Arguments) {
		deleted = whereParams(args.Get(1))[0].([]string)
	}).Return(nil).Once()
	transaction.On("All", mock.AnythingOfType("*[]*models.OtelPromptEvent"), mock.Anything, mock.Anything, mock.Anything).Return(nil).Once()
	transaction.On("Commit").Return(nil).Once()
	request := &models.OtelReplayRequest{RangeStart: converter.now().Add(-time.Hour), RangeEnd: converter.now()}

	// A renewal just happened, so the replay lease is not renewed again.
	lastRenewal := converter.now()
	diagnostics := &replayDiagnostics{}
	replayed, skipped, err := converter.replayLogBatches(request, "owner", &lastRenewal, diagnostics)
	if err != nil || replayed != 1 || skipped != 1 {
		t.Fatalf("replayLogBatches() = %d, %d, %v, want the decodable batch replayed and the other skipped", replayed, skipped, err)
	}
	if len(deleted) != 1 || stored == nil || deleted[0] != stored.Id {
		t.Fatalf("deleted event ids %v, want the re-derived event's id", deleted)
	}
	if message := diagnostics.message(); message == nil || !strings.Contains(*message, "batch=4 code="+string(errorInvalidPayload)) {
		t.Fatalf("diagnostics = %v, want the undecodable batch 4 recorded", message)
	}
}

func TestReplayLogBatchesStopsWhenTheConverterLeaseIsLost(t *testing.T) {
	converter, database := boundConverter(t)
	expectReplayPage(database, logBatch(t, 5, attributedRecord("api_request")))
	transaction := dalmocks.NewTransaction(t)
	database.On("Begin").Return(transaction).Once()
	expectConverterLease(converter, transaction, "another-worker")
	transaction.On("Rollback").Return(nil).Once()
	request := &models.OtelReplayRequest{RangeStart: converter.now().Add(-time.Hour), RangeEnd: converter.now()}

	lastRenewal := converter.now()
	replayed, _, err := converter.replayLogBatches(request, "owner", &lastRenewal, &replayDiagnostics{})
	if err == nil || replayed != 0 {
		t.Fatalf("replayLogBatches() = %d, %v, want the lease loss and nothing replayed", replayed, err)
	}
}

func TestReplayLogBatchesReturnsLoadError(t *testing.T) {
	database := dalmocks.NewDal(t)
	database.On("All", mock.AnythingOfType("*[]*models.OtelLogBatch"), mock.Anything, mock.Anything, mock.Anything).Return(errors.Default.New("connection lost")).Once()
	request := &models.OtelReplayRequest{RangeStart: time.Unix(0, 0), RangeEnd: time.Unix(3600, 0)}

	var lastRenewal time.Time
	if _, _, err := newRawMetricConverter(database, nil).replayLogBatches(request, "owner", &lastRenewal, &replayDiagnostics{}); err == nil {
		t.Fatal("replayLogBatches() error = nil, want the load error")
	}
}
