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
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
	collectorlogs "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

func TestIngestLogsStripsContentBeforeStorage(t *testing.T) {
	service, database := newRawIngestService(t)
	transaction := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(transaction)
	var stored *models.OtelLogBatch
	transaction.EXPECT().Create(mock.AnythingOfType("*models.OtelLogBatch")).Run(func(batch interface{}, _ ...dal.Clause) {
		stored = batch.(*models.OtelLogBatch)
		stored.ID = 7
	}).Return(nil)
	transaction.EXPECT().Commit().Return(nil)

	request := newOtelLogsHTTPRequest(t, loadLogEventsFixture(t), "collector-token")
	result, err := service.IngestLogs(request)
	if err != nil {
		t.Fatalf("IngestLogs() error = %v", err)
	}
	if result.BatchID != 7 || stored.RecordCount != 13 || stored.MinObservedAt == nil || stored.MaxObservedAt == nil {
		t.Fatalf("IngestLogs() result=%#v records=%d observed=%v..%v", result, stored.RecordCount, stored.MinObservedAt, stored.MaxObservedAt)
	}
	decoded, decodeErr := decodeOtelLogBatchRequest(stored)
	if decodeErr != nil {
		t.Fatalf("decodeOtelLogBatchRequest() error = %v", decodeErr)
	}
	apiErrorKeptMessage := false
	promptTexts := make(map[string]string)
	for _, record := range resourceLogRecords(decoded.GetResourceLogs()[0]) {
		for _, key := range []string{"prompt", "response", "tool_input", "body", "body_ref"} {
			if hasAttribute(record.GetAttributes(), key) {
				t.Fatalf("%s event kept content attribute %q", logEventName(record), key)
			}
		}
		copies := 0
		for _, attribute := range record.GetAttributes() {
			if attribute.GetKey() == promptTextAttribute {
				copies++
				promptTexts[attributeString(record.GetAttributes(), "prompt.id")] = attribute.GetValue().GetStringValue()
			}
		}
		if copies > 1 {
			t.Fatalf("%s event kept %d copies of the prompt text", logEventName(record), copies)
		}
		switch logEventName(record) {
		case eventToolResult:
			if hasAttribute(record.GetAttributes(), "error") {
				t.Fatal("tool_result kept its error message")
			}
		case eventAPIError:
			apiErrorKeptMessage = attributeString(record.GetAttributes(), "error") == "overloaded"
		}
	}
	if !apiErrorKeptMessage {
		t.Fatal("api_error lost its error message")
	}
	// p1 sends prompt and prompt_text, p2 (an older client) only prompt, p3 a redacted value.
	want := map[string]string{"p1": "Summarize the failing tests", "p2": "  Review the auth change\n"}
	if len(promptTexts) != len(want) || promptTexts["p1"] != want["p1"] || promptTexts["p2"] != want["p2"] {
		t.Fatalf("stored prompt texts = %q, want %q", promptTexts, want)
	}
}

func TestIngestLogsRejectsUnauthenticatedRequest(t *testing.T) {
	service, _ := newRawIngestService(t)
	_, err := service.IngestLogs(newOtelLogsHTTPRequest(t, loadLogEventsFixture(t), "incorrect"))
	if err == nil || err.GetType().GetHttpCode() != http.StatusForbidden {
		t.Fatalf("IngestLogs() error = %v, want 403", err)
	}
}

func TestIngestLogsRejectsEmptyRequest(t *testing.T) {
	service, _ := newRawIngestService(t)
	_, err := service.IngestLogs(newOtelLogsHTTPRequest(t, &collectorlogs.ExportLogsServiceRequest{}, "collector-token"))
	if err == nil || err.GetType().GetHttpCode() != http.StatusBadRequest {
		t.Fatalf("IngestLogs() error = %v, want 400", err)
	}
}

func TestPrepareEventsMapsTypedColumnsAndKeepsAttributes(t *testing.T) {
	request := loadLogEventsFixture(t)
	stripContentAttributes(request)
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})

	prepared, err := newRawMetricConverter(database, nil).prepareEvents(request, 9)
	if err != nil {
		t.Fatalf("prepareEvents() error = %v", err)
	}
	if len(prepared.events) != 13 || prepared.skippedCount != 0 {
		t.Fatalf("prepareEvents() events=%d skipped=%d, want 13 and 0", len(prepared.events), prepared.skippedCount)
	}
	keys := make(map[string]struct{})
	for _, item := range prepared.events {
		event := item.event
		keys[string(event.EventKey)] = struct{}{}
		if event.SessionId != "sess-1" || event.OrganizationId != testOrganizationID || event.UserKey != "uuid:aaaa1111-1111-4111-8111-111111111111" || event.RawBatchId != 9 {
			t.Fatalf("%s identity = %q %q %q %d", event.EventName, event.SessionId, event.OrganizationId, event.UserKey, event.RawBatchId)
		}
	}
	if len(keys) != 13 {
		t.Fatalf("event keys are not unique: %d", len(keys))
	}

	skillTool := findPreparedEvent(t, prepared, eventToolResult, "tu-1")
	if skillTool.SkillName != "code-review" || skillTool.Success == nil || !*skillTool.Success || int64Value(skillTool.DurationMs) != 12 {
		t.Fatalf("Skill tool_result = skill %q success %v duration %v", skillTool.SkillName, skillTool.Success, skillTool.DurationMs)
	}
	var attributes map[string]interface{}
	if err := json.Unmarshal(skillTool.Attributes, &attributes); err != nil {
		t.Fatalf("attributes are not JSON: %v", err)
	}
	if parameters, ok := attributes["tool_parameters"].(map[string]interface{}); !ok || parameters["skill_name"] != "code-review" {
		t.Fatalf("tool_parameters = %#v, want parsed object", attributes["tool_parameters"])
	}
	if attributes["service.version"] != "2.1.300" || attributes["terminal.type"] != "iTerm.app" {
		t.Fatalf("attributes lost resource or record values: %#v", attributes)
	}

	for _, item := range prepared.events {
		event := item.event
		if bytes.Contains(event.Attributes, []byte(promptTextAttribute)) {
			t.Fatalf("%s attributes kept the prompt text: %s", event.EventName, event.Attributes)
		}
		wantText := map[string]string{"p1": "Summarize the failing tests", "p2": "  Review the auth change\n"}[event.PromptId]
		if event.EventName != eventUserPrompt {
			wantText = ""
		}
		if got := stringValue(event.PromptText); got != wantText {
			t.Fatalf("%s %s prompt text = %q, want %q", event.EventName, event.PromptId, got, wantText)
		}
	}

	apiRequest := findPreparedEvent(t, prepared, eventAPIRequest, "req-2")
	if apiRequest.InputTokens != 2000 || apiRequest.OutputTokens != 500 || apiRequest.CostUsd == nil || *apiRequest.CostUsd != "0.06000000" || apiRequest.SkillName != "code-review" {
		t.Fatalf("api_request = tokens %d/%d cost %v skill %q", apiRequest.InputTokens, apiRequest.OutputTokens, apiRequest.CostUsd, apiRequest.SkillName)
	}
	if !apiRequest.EventTimestamp.Equal(time.Date(2026, 10, 14, 10, 2, 5, 0, time.UTC)) {
		t.Fatalf("api_request timestamp = %s", apiRequest.EventTimestamp)
	}
}

func TestPrepareEventsSkipsResourceWithoutTeam(t *testing.T) {
	request := loadLogEventsFixture(t)
	records := resourceLogRecords(request.GetResourceLogs()[0])
	records[0].Attributes = withoutAttributes(records[0].GetAttributes(), map[string]struct{}{devlakeTeamAttribute: {}})

	prepared, err := newRawMetricConverter(dalmocks.NewDal(t), nil).prepareEvents(request, 1)
	if err != nil {
		t.Fatalf("prepareEvents() error = %v", err)
	}
	if len(prepared.events) != 0 || prepared.skippedCount != 1 || prepared.diagnosticCode() == nil {
		t.Fatalf("prepareEvents() events=%d skipped=%d, want the resource group skipped", len(prepared.events), prepared.skippedCount)
	}
}

func TestSessionModesInferEachPromptMode(t *testing.T) {
	at := func(minute int) time.Time { return time.Date(2026, 10, 14, 10, minute, 0, 0, time.UTC) }
	change := func(minute int, from, to string) *models.OtelEvent {
		attributes, _ := json.Marshal(map[string]string{"from_mode": from, "to_mode": to})
		return &models.OtelEvent{EventName: eventPermissionModeChanged, EventTimestamp: at(minute), Attributes: attributes}
	}
	promptEvent := func(minute int, command string) *models.OtelEvent {
		attributes, _ := json.Marshal(map[string]string{"command_name": command})
		return &models.OtelEvent{EventName: eventUserPrompt, EventTimestamp: at(minute), Attributes: attributes}
	}
	planCommand := func(minute int) *models.OtelEvent { return promptEvent(minute, "plan") }
	testCases := []struct {
		name         string
		changes      []*models.OtelEvent
		promptMinute int
		mode         string
		inferred     bool
	}{
		{name: "no change is assumed default", promptMinute: 5, mode: ai.PermissionModeDefault, inferred: true},
		{name: "after a change", changes: []*models.OtelEvent{change(1, "default", "plan")}, promptMinute: 2, mode: "plan"},
		{name: "before the first change takes its from_mode", changes: []*models.OtelEvent{change(3, "plan", "default")}, promptMinute: 1, mode: "plan"},
		{name: "after exiting plan mode", changes: []*models.OtelEvent{change(1, "default", "plan"), change(3, "plan", "acceptEdits")}, promptMinute: 4, mode: "acceptEdits"},
		{name: "changes arrive out of order", changes: []*models.OtelEvent{change(3, "plan", "default"), change(1, "default", "plan")}, promptMinute: 2, mode: "plan"},
		// /plan emits no permission_mode_changed; the exit from plan mode does.
		{name: "prompt before /plan", changes: []*models.OtelEvent{planCommand(2), change(5, "plan", "bypassPermissions")}, promptMinute: 1, mode: ai.PermissionModeDefault, inferred: true},
		{name: "prompt after /plan", changes: []*models.OtelEvent{planCommand(2), change(5, "plan", "bypassPermissions")}, promptMinute: 3, mode: "plan"},
		{name: "prompt after leaving plan mode", changes: []*models.OtelEvent{planCommand(2), change(5, "plan", "bypassPermissions")}, promptMinute: 6, mode: "bypassPermissions"},
		{name: "ordinary prompts are not mode changes", changes: []*models.OtelEvent{promptEvent(1, ""), promptEvent(2, "review")}, promptMinute: 3, mode: ai.PermissionModeDefault, inferred: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			mode, inferred := newSessionModes(testCase.changes).modeAt(at(testCase.promptMinute), 0)
			if mode != testCase.mode || inferred != testCase.inferred {
				t.Fatalf("modeAt() = %q inferred=%t, want %q inferred=%t", mode, inferred, testCase.mode, testCase.inferred)
			}
		})
	}
}

func TestBuildPromptRollupMergesSkillSourcesAndCounts(t *testing.T) {
	events := fixturePromptEvents(t, "p2")
	rollup := buildPromptRollup(testOrganizationID, "p2", events)
	prompt := rollup.prompt

	if !prompt.StartedAt.Equal(time.Date(2026, 10, 14, 10, 2, 0, 0, time.UTC)) || prompt.PromptLength != 120 || prompt.SessionId != "sess-1" {
		t.Fatalf("prompt start/length/session = %s %d %q", prompt.StartedAt, prompt.PromptLength, prompt.SessionId)
	}
	if prompt.ApiRequestCount != 1 || prompt.ApiErrorCount != 1 || prompt.InputTokens != 2000 || prompt.EstimatedCostUsd != "0.06000000" || prompt.ModelsUsed != "claude-opus-5-5" {
		t.Fatalf("prompt API facts = %d requests %d errors %d input %s cost %q models", prompt.ApiRequestCount, prompt.ApiErrorCount, prompt.InputTokens, prompt.EstimatedCostUsd, prompt.ModelsUsed)
	}
	if prompt.ToolCallCount != 2 || prompt.ToolFailureCount != 1 || prompt.ToolRejectCount != 1 {
		t.Fatalf("prompt tool facts = %d calls %d failures %d rejects", prompt.ToolCallCount, prompt.ToolFailureCount, prompt.ToolRejectCount)
	}
	if !prompt.UsedSkill || prompt.SkillCount != 1 || len(rollup.skills) != 1 {
		t.Fatalf("prompt skills = used %t count %d rows %d, want one merged skill", prompt.UsedSkill, prompt.SkillCount, len(rollup.skills))
	}
	skill := rollup.skills[0]
	if skill.SkillName != "code-review" || skill.DetectedVia != ai.SkillDetectedViaActivation || skill.InvocationTrigger != "claude-proactive" || skill.SkillSource != "userSettings" || skill.SessionId != "sess-1" {
		t.Fatalf("skill = %#v", skill)
	}
	if skill.Id != ai.PromptSkillID(aiProviderClaude, testOrganizationID, "p2", "code-review") || prompt.Id != ai.PromptID(aiProviderClaude, testOrganizationID, "p2") {
		t.Fatalf("prompt or skill id is not canonical: %q %q", prompt.Id, skill.Id)
	}

	command := buildPromptRollup(testOrganizationID, "p3", fixturePromptEvents(t, "p3")).prompt
	if command.CommandName != "review" || command.CommandSource != "builtin" || command.UsedSkill {
		t.Fatalf("command prompt = %q %q used skill %t", command.CommandName, command.CommandSource, command.UsedSkill)
	}
}

func TestPromptRollupNeverCarriesPromptText(t *testing.T) {
	for _, promptID := range []string{"p1", "p2"} {
		rollup := buildPromptRollup(testOrganizationID, promptID, fixturePromptEvents(t, promptID))
		encoded, err := json.Marshal(rollup)
		if err != nil {
			t.Fatalf("json.Marshal() error = %v", err)
		}
		prompt, _ := json.Marshal(rollup.prompt)
		skills, _ := json.Marshal(rollup.skills)
		for _, text := range []string{"Summarize the failing tests", "Review the auth change"} {
			if bytes.Contains(prompt, []byte(text)) || bytes.Contains(skills, []byte(text)) || bytes.Contains(encoded, []byte(text)) {
				t.Fatalf("%s rollup carries prompt text", promptID)
			}
		}
	}
	if !strings.Contains(rollupEventColumnsSQL(), "attributes") || strings.Contains(rollupEventColumnsSQL(), promptTextAttribute) {
		t.Fatalf("rollup event columns = %q, must not load prompt_text", rollupEventColumnsSQL())
	}
}

func TestClearExpiredPromptTextKeepsEventRows(t *testing.T) {
	database := dalmocks.NewDal(t)
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	expiredKeys := [][]byte{{1}, {2}}
	database.EXPECT().Pluck("event_key", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Run(func(_ string, destination interface{}, clauses ...dal.Clause) {
		where := clauses[1].Data.(dal.DalClause)
		if where.Expr != "prompt_text IS NOT NULL AND event_timestamp < ?" || !where.Params[0].(time.Time).Equal(now.Add(-rawBatchRetention)) {
			t.Fatalf("Pluck() where = %q %v", where.Expr, where.Params)
		}
		*destination.(*[][]byte) = expiredKeys
	}).Return(nil).Once()
	database.EXPECT().UpdateColumn(mock.AnythingOfType("*models.OtelEvent"), "prompt_text", nil, mock.Anything).Return(nil).Once()

	if err := newRawMetricConverter(database, nil).clearExpiredPromptText(now); err != nil {
		t.Fatalf("clearExpiredPromptText() error = %v", err)
	}
}

func rollupEventColumnsSQL() string {
	return rollupEventColumns.Data.(dal.DalClause).Expr
}

func TestSessionTargetsGroupPromptsAndFlagModeChanges(t *testing.T) {
	request := loadLogEventsFixture(t)
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})
	prepared, err := newRawMetricConverter(database, nil).prepareEvents(request, 1)
	if err != nil {
		t.Fatalf("prepareEvents() error = %v", err)
	}
	targets := sessionTargets(prepared.events)
	if len(targets) != 1 || !targets[0].modeChanged || len(targets[0].promptIDs) != 3 {
		t.Fatalf("sessionTargets() = %d targets, modeChanged %t, prompts %d", len(targets), targets[0].modeChanged, len(targets[0].promptIDs))
	}
}

func loadLogEventsFixture(t *testing.T) *collectorlogs.ExportLogsServiceRequest {
	t.Helper()
	payload, err := os.ReadFile("testdata/claude_code_log_events.json")
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	request := &collectorlogs.ExportLogsServiceRequest{}
	if err := protojson.Unmarshal(payload, request); err != nil {
		t.Fatalf("protojson.Unmarshal() error = %v", err)
	}
	return request
}

func newOtelLogsHTTPRequest(t *testing.T, logs *collectorlogs.ExportLogsServiceRequest, token string) *http.Request {
	t.Helper()
	payload, err := proto.Marshal(logs)
	if err != nil {
		t.Fatalf("proto.Marshal() error = %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/plugins/claude_otel/otlp/v1/logs", bytes.NewReader(payload))
	request.Header.Set("Content-Type", otlpProtobufContentType)
	request.Header.Set(claudeOtelIngestTokenHeader, token)
	return request
}

// fixturePromptEvents converts the fixture and returns one prompt's events, as the rollup
// loads them from storage.
func fixturePromptEvents(t *testing.T, promptID string) []*models.OtelEvent {
	t.Helper()
	request := loadLogEventsFixture(t)
	stripContentAttributes(request)
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})
	prepared, err := newRawMetricConverter(database, nil).prepareEvents(request, 1)
	if err != nil {
		t.Fatalf("prepareEvents() error = %v", err)
	}
	events := make([]*models.OtelEvent, 0)
	for _, item := range prepared.events {
		if item.event.PromptId == promptID {
			events = append(events, item.event)
		}
	}
	return events
}

func findPreparedEvent(t *testing.T, prepared *preparedLogBatch, eventName, correlationID string) *models.OtelEvent {
	t.Helper()
	for _, item := range prepared.events {
		if item.event.EventName != eventName {
			continue
		}
		var attributes map[string]interface{}
		_ = json.Unmarshal(item.event.Attributes, &attributes)
		if attributes["tool_use_id"] == correlationID || attributes["request_id"] == correlationID {
			return item.event
		}
	}
	t.Fatalf("no %s event with id %s", eventName, correlationID)
	return nil
}
