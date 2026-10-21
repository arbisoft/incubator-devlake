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
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
	collectorlogs "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	logsv1 "go.opentelemetry.io/proto/otlp/logs/v1"
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
		if parameters := untrimmedStringAttribute(record.GetAttributes(), toolParametersAttribute); parameters != "" {
			var fields map[string]interface{}
			if err := json.Unmarshal([]byte(parameters), &fields); err != nil {
				t.Fatalf("%s tool_parameters is not a JSON object: %q", logEventName(record), parameters)
			}
			for key := range fields {
				if _, allowed := toolParameterKeys[key]; !allowed {
					t.Fatalf("%s tool_parameters kept %q", logEventName(record), key)
				}
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

func TestFilterToolParametersKeepsOnlyAllowlistedKeys(t *testing.T) {
	stringParameters := func(value string) *commonv1.KeyValue {
		return &commonv1.KeyValue{Key: toolParametersAttribute, Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: value}}}
	}
	tests := []struct {
		name      string
		parameter *commonv1.KeyValue
		want      string
	}{
		{"mixed keys", stringParameters(`{"skill_name":"code-review","full_command":"curl -H 'Authorization: Bearer x'"}`), `{"skill_name":"code-review"}`},
		{"mcp keys", stringParameters(`{"mcp_server_name":"github","mcp_tool_name":"create_issue","file_path":"/etc/passwd"}`), `{"mcp_server_name":"github","mcp_tool_name":"create_issue"}`},
		{"only disallowed keys", stringParameters(`{"bash_command":"cat","full_command":"cat secret.txt"}`), ""},
		{"invalid JSON", stringParameters(`full_command=cat secret.txt`), ""},
		{"not an object", stringParameters(`["skill_name"]`), ""},
		{"not a string", &commonv1.KeyValue{Key: toolParametersAttribute, Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_KvlistValue{KvlistValue: &commonv1.KeyValueList{Values: []*commonv1.KeyValue{
			{Key: "full_command", Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: "cat secret.txt"}}},
		}}}}}, ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			event := &commonv1.KeyValue{Key: "event.name", Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: "tool_result"}}}
			filtered := filterToolParameters([]*commonv1.KeyValue{event, test.parameter})
			if !hasAttribute(filtered, "event.name") {
				t.Fatal("filterToolParameters() dropped an unrelated attribute")
			}
			got := untrimmedStringAttribute(filtered, toolParametersAttribute)
			if test.want == "" {
				if hasAttribute(filtered, toolParametersAttribute) {
					t.Fatalf("tool_parameters = %v, want dropped", filtered)
				}
				return
			}
			if got != test.want {
				t.Fatalf("tool_parameters = %s, want %s", got, test.want)
			}
		})
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

	prepared, err := newRawConverter(database, nil).prepareEvents(request, 9)
	if err != nil {
		t.Fatalf("prepareEvents() error = %v", err)
	}
	if len(prepared.events) != 13 || prepared.skipped[skippedResource] != 0 {
		t.Fatalf("prepareEvents() events=%d skipped=%d, want 13 and 0", len(prepared.events), prepared.skipped[skippedResource])
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
	commandPrompts := 0
	for _, item := range prepared.events {
		if item.event.CommandName == "review" && item.event.EventName == eventUserPrompt {
			commandPrompts++
		}
	}
	if commandPrompts != 1 {
		t.Fatalf("user_prompt events with command_name review = %d, want 1", commandPrompts)
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
		if bytes.Contains(event.Attributes, []byte("full_command")) || bytes.Contains(event.Attributes, []byte("secret.txt")) {
			t.Fatalf("%s attributes kept a command line: %s", event.EventName, event.Attributes)
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

func TestPrepareEventsSkipsOnlyInvalidRecords(t *testing.T) {
	request := loadLogEventsFixture(t)
	stripContentAttributes(request)
	records := resourceLogRecords(request.GetResourceLogs()[0])
	kept := records[0].GetAttributes()[:0]
	for _, attribute := range records[0].GetAttributes() {
		if !strings.HasPrefix(attribute.GetKey(), "user.") {
			kept = append(kept, attribute)
		}
	}
	records[0].Attributes = kept
	records[1].Attributes = withoutAttributes(records[1].GetAttributes(), map[string]struct{}{"event.name": {}})
	records[1].Body = nil
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})

	prepared, err := newRawConverter(database, nil).prepareEvents(request, 9)
	if err != nil {
		t.Fatalf("prepareEvents() error = %v", err)
	}
	if len(prepared.events) != 11 || prepared.skipped[skippedResource] != 0 || prepared.skipped[skippedLogRecord] != 2 {
		t.Fatalf("prepareEvents() events=%d skipped groups=%d records=%d, want 11, 0 and 2", len(prepared.events), prepared.skipped[skippedResource], prepared.skipped[skippedLogRecord])
	}
	if code := prepared.diagnosticCode(); code == nil || *code != string(diagnosticRecordsSkipped) {
		t.Fatalf("diagnosticCode() = %v, want %s", code, diagnosticRecordsSkipped)
	}
	message := prepared.diagnostic()
	if message == nil || !strings.Contains(*message, "2 log record(s)") ||
		!strings.Contains(*message, string(errorMissingUserIdentity)) || !strings.Contains(*message, string(errorInvalidDimension)) {
		t.Fatalf("diagnostic() = %v, want both skipped records", message)
	}
}

func TestPrepareEventsSkipsOnlyRecordsWithOversizedKeys(t *testing.T) {
	request := loadLogEventsFixture(t)
	stripContentAttributes(request)
	records := resourceLogRecords(request.GetResourceLogs()[0])
	setStringAttribute(records[0], "session.id", strings.Repeat("s", eventIDColumnLength+1))
	setStringAttribute(records[7], "prompt.id", strings.Repeat("p", eventIDColumnLength+1))
	// A value at the column width still fits.
	setStringAttribute(records[6], "prompt.id", strings.Repeat("é", eventIDColumnLength))
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})

	prepared, err := newRawConverter(database, nil).prepareEvents(request, 9)
	if err != nil {
		t.Fatalf("prepareEvents() error = %v, want only the oversized records skipped", err)
	}
	if len(prepared.events) != 11 || prepared.skipped[skippedResource] != 0 || prepared.skipped[skippedLogRecord] != 2 {
		t.Fatalf("prepareEvents() events=%d skipped groups=%d records=%d, want 11, 0 and 2", len(prepared.events), prepared.skipped[skippedResource], prepared.skipped[skippedLogRecord])
	}
	message := prepared.diagnostic()
	if message == nil || !strings.Contains(*message, string(errorValueTooLong)) {
		t.Fatalf("diagnostic() = %v, want %s", message, errorValueTooLong)
	}
}

func TestPrepareEventsSkipsOnlyRecordsWithOversizedIdentity(t *testing.T) {
	request := loadLogEventsFixture(t)
	stripContentAttributes(request)
	records := resourceLogRecords(request.GetResourceLogs()[0])
	setStringAttribute(records[1], "user.email", strings.Repeat("e", identityColumnLength+1))
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})

	prepared, err := newRawConverter(database, nil).prepareEvents(request, 9)
	if err != nil || len(prepared.events) != 12 || prepared.skipped[skippedLogRecord] != 1 {
		t.Fatalf("prepareEvents() = %v, %v; want 12 events and the oversized identity record skipped", prepared, err)
	}
}

func TestPrepareEventsTruncatesDescriptiveColumnsToTheirWidth(t *testing.T) {
	request := loadLogEventsFixture(t)
	stripContentAttributes(request)
	records := resourceLogRecords(request.GetResourceLogs()[0])
	longToolName := strings.Repeat("é", 300)
	setStringAttribute(records[7], "tool_name", longToolName)
	setStringAttribute(records[6], "model", strings.Repeat("m", 300))
	setStringAttribute(records[6], "app.version", strings.Repeat("9", 100))
	setStringAttribute(records[6], "query_source", strings.Repeat("q", 200))
	setStringAttribute(records[11], "command_name", strings.Repeat("c", 300))
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})

	prepared, err := newRawConverter(database, nil).prepareEvents(request, 9)
	if err != nil || len(prepared.events) != 13 || prepared.skipped[skippedLogRecord] != 0 {
		t.Fatalf("prepareEvents() = %v, %v; want every record kept", prepared, err)
	}
	bash := findPreparedEvent(t, prepared, eventToolResult, "tu-2")
	if bash.ToolName != strings.Repeat("é", eventNamedColumnLength) || !utf8.ValidString(bash.ToolName) {
		t.Fatalf("tool_name = %d characters, want %d whole characters", utf8.RuneCountInString(bash.ToolName), eventNamedColumnLength)
	}
	var attributes map[string]interface{}
	if err := json.Unmarshal(bash.Attributes, &attributes); err != nil || attributes["tool_name"] != longToolName {
		t.Fatalf("attributes tool_name = %v, want the full value kept", attributes["tool_name"])
	}
	apiRequest := findPreparedEvent(t, prepared, eventAPIRequest, "req-2")
	if len(apiRequest.Model) != eventNamedColumnLength || len(apiRequest.AppVersion) != eventVersionColumnLength || len(apiRequest.QuerySource) != eventLabelColumnLength {
		t.Fatalf("api_request model/app_version/query_source lengths = %d/%d/%d", len(apiRequest.Model), len(apiRequest.AppVersion), len(apiRequest.QuerySource))
	}
	for _, item := range prepared.events {
		if item.event.PromptId == "p3" && item.event.EventName == eventUserPrompt && len(item.event.CommandName) != eventNamedColumnLength {
			t.Fatalf("command_name length = %d, want %d", len(item.event.CommandName), eventNamedColumnLength)
		}
	}
}

func TestPromptRollupTruncatesAttributeValuesToAiColumns(t *testing.T) {
	request := loadLogEventsFixture(t)
	stripContentAttributes(request)
	records := resourceLogRecords(request.GetResourceLogs()[0])
	setStringAttribute(records[11], "command_source", strings.Repeat("b", 40))
	setStringAttribute(records[4], "invocation_trigger", strings.Repeat("t", 100))
	setStringAttribute(records[2], "from_mode", strings.Repeat("f", 100))
	setStringAttribute(records[2], "to_mode", strings.Repeat("o", 100))
	setStringAttribute(records[2], "trigger", strings.Repeat("r", 100))
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})
	prepared, err := newRawConverter(database, nil).prepareEvents(request, 1)
	if err != nil {
		t.Fatalf("prepareEvents() error = %v", err)
	}
	byPrompt := make(map[string][]*models.OtelEvent)
	modeEvents := make([]*models.OtelEvent, 0)
	for _, item := range prepared.events {
		byPrompt[item.event.PromptId] = append(byPrompt[item.event.PromptId], item.event)
		if isModeChangeEvent(item.event) {
			modeEvents = append(modeEvents, item.event)
		}
	}

	if command := buildPromptRollup(testOrganizationID, "p3", byPrompt["p3"]).prompt; len(command.CommandSource) != maxCommandSourceLength {
		t.Fatalf("command_source length = %d, want %d", len(command.CommandSource), maxCommandSourceLength)
	}
	skills := buildPromptRollup(testOrganizationID, "p2", byPrompt["p2"]).skills
	if len(skills) != 1 || len(skills[0].InvocationTrigger) != maxAiLabelLength {
		t.Fatalf("skills = %#v, want one skill with a %d-character trigger", skills, maxAiLabelLength)
	}
	change := newSessionModes(modeEvents).changes[0]
	if len(change.fromMode) != maxAiLabelLength || len(change.toMode) != maxAiLabelLength || len(change.trigger) != maxAiLabelLength {
		t.Fatalf("mode change lengths = %d/%d/%d, want %d", len(change.fromMode), len(change.toMode), len(change.trigger), maxAiLabelLength)
	}
}

// setStringAttribute replaces a record's string attribute, or adds it.
// A record sent before the client signed in has no organization.id; the rest of its
// resource group is still converted.
func TestPrepareEventsSkipsOnlyRecordsWithoutOrganization(t *testing.T) {
	request := loadLogEventsFixture(t)
	stripContentAttributes(request)
	records := resourceLogRecords(request.GetResourceLogs()[0])
	records[2].Attributes = withoutAttributes(records[2].GetAttributes(), map[string]struct{}{organizationIDAttribute: {}})
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})

	prepared, err := newRawConverter(database, nil).prepareEvents(request, 9)
	if err != nil || len(prepared.events) != 12 || prepared.skipped[skippedResource] != 0 || prepared.skipped[skippedLogRecord] != 1 {
		t.Fatalf("prepareEvents() = %v, %v; want 12 events and only the record without organization.id skipped", prepared, err)
	}
	if message := prepared.diagnostic(); message == nil || !strings.Contains(*message, string(errorMissingOrganization)) {
		t.Fatalf("diagnostic() = %v, want %s", message, errorMissingOrganization)
	}
}

// The attributes column keeps only allowlisted attributes, so an attribute a later Claude
// Code release adds is not stored with the event.
func TestPrepareEventsStoresOnlyAllowlistedAttributes(t *testing.T) {
	request := loadLogEventsFixture(t)
	stripContentAttributes(request)
	for _, record := range resourceLogRecords(request.GetResourceLogs()[0]) {
		setStringAttribute(record, "assistant_draft", "content from a future release")
	}
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})

	prepared, err := newRawConverter(database, nil).prepareEvents(request, 9)
	if err != nil || len(prepared.events) != 13 {
		t.Fatalf("prepareEvents() = %v, %v; want 13 events", prepared, err)
	}
	for _, item := range prepared.events {
		var attributes map[string]interface{}
		if err := json.Unmarshal(item.event.Attributes, &attributes); err != nil {
			t.Fatalf("attributes are not JSON: %v", err)
		}
		for key := range attributes {
			if _, allowed := storedEventAttributes[key]; !allowed {
				t.Fatalf("%s attributes kept %q, which is not allowlisted", item.event.EventName, key)
			}
		}
		if _, kept := attributes["event.sequence"]; !kept {
			t.Fatalf("%s attributes = %v, want allowlisted attributes kept", item.event.EventName, attributes)
		}
	}
}

// A raw batch stored before ingest normalized the repository URL is converted again on
// replay, so conversion normalizes it too, the same way ingest does.
func TestStoredAttributesNormalizesTheRepositoryURL(t *testing.T) {
	tests := []struct {
		name  string
		value interface{}
		want  string
	}{
		{"credentials, case and .git", "https://user:secret@GitHub.com/Org/Repo.git", "https://github.com/org/repo"},
		{"already normalized", "https://github.com/org/repo", "https://github.com/org/repo"},
		{"local drive path", "C:/Users/dev/repos/origin.git", ""},
		{"not a string", int64(42), ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			stored := storedAttributes(map[string]interface{}{
				repositoryURLAttribute: test.value,
				"vcs.repository.name":  "Repo",
				"vcs.owner.name":       "Org",
				"assistant_draft":      "content from a future release",
			})
			if got := stored[repositoryURLAttribute]; got != test.want {
				t.Fatalf("repository url = %#v, want %q", got, test.want)
			}
			if stored["vcs.repository.name"] != "Repo" || stored["vcs.owner.name"] != "Org" {
				t.Fatalf("stored = %v, want the other vcs attributes untouched", stored)
			}
			if _, kept := stored["assistant_draft"]; kept {
				t.Fatalf("stored = %v, want attributes outside the allowlist dropped", stored)
			}
		})
	}

	stored := storedAttributes(map[string]interface{}{"vcs.repository.name": "Repo"})
	if _, added := stored[repositoryURLAttribute]; added || len(stored) != 1 {
		t.Fatalf("stored = %v, want no repository url added", stored)
	}
}

func TestPrepareEventsNormalizesTheStoredRepositoryURL(t *testing.T) {
	const secret = "ghp_replaysecret"
	request := loadLogEventsFixture(t)
	stripContentAttributes(request)
	for _, record := range resourceLogRecords(request.GetResourceLogs()[0]) {
		setStringAttribute(record, repositoryURLAttribute, "https://user:"+secret+"@GitHub.com/Example-Org/Example-Repo.git")
	}
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})

	prepared, err := newRawConverter(database, nil).prepareEvents(request, 9)
	if err != nil || len(prepared.events) == 0 {
		t.Fatalf("prepareEvents() = %v, %v; want events", prepared, err)
	}
	for _, item := range prepared.events {
		if bytes.Contains(item.event.Attributes, []byte(secret)) {
			t.Fatalf("%s attributes kept the credential: %s", item.event.EventName, item.event.Attributes)
		}
		var attributes map[string]interface{}
		if err := json.Unmarshal(item.event.Attributes, &attributes); err != nil {
			t.Fatalf("attributes are not JSON: %v", err)
		}
		if got := attributes[repositoryURLAttribute]; got != "https://github.com/example-org/example-repo" {
			t.Fatalf("%s repository url = %v, want it normalized", item.event.EventName, got)
		}
	}
}

func setStringAttribute(record *logsv1.LogRecord, key, value string) {
	attribute := &commonv1.KeyValue{Key: key, Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: value}}}
	record.Attributes = append(withoutAttributes(record.GetAttributes(), map[string]struct{}{key: {}}), attribute)
}

func TestPrepareEventsFailsBatchOnConnectionLookupError(t *testing.T) {
	request := loadLogEventsFixture(t)
	stripContentAttributes(request)
	database := dalmocks.NewDal(t)
	database.EXPECT().All(mock.AnythingOfType("*[]*models.OtelConnection"), mock.Anything).Return(errors.Default.New("database unavailable"))

	_, err := newRawConverter(database, nil).prepareEvents(request, 9)
	if code, permanent, _ := classifyConversionError(err); err == nil || code != errorConnectionLookup || permanent {
		t.Fatalf("prepareEvents() error = %v, want retryable %s", err, errorConnectionLookup)
	}
}

func TestPrepareEventsSkipsResourceWithoutTeam(t *testing.T) {
	request := loadLogEventsFixture(t)
	records := resourceLogRecords(request.GetResourceLogs()[0])
	records[0].Attributes = withoutAttributes(records[0].GetAttributes(), map[string]struct{}{devlakeTeamAttribute: {}})

	prepared, err := newRawConverter(dalmocks.NewDal(t), nil).prepareEvents(request, 1)
	if err != nil {
		t.Fatalf("prepareEvents() error = %v", err)
	}
	if len(prepared.events) != 0 || prepared.skipped[skippedResource] != 1 || prepared.diagnosticCode() == nil {
		t.Fatalf("prepareEvents() events=%d skipped=%d, want the resource group skipped", len(prepared.events), prepared.skipped[skippedResource])
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
		return &models.OtelEvent{EventName: eventUserPrompt, EventTimestamp: at(minute), CommandName: command, Attributes: attributes}
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
	if skill.Id != (ai.CanonicalKey{Kind: ai.IDKindPromptSkill, Provider: aiProviderClaude, WorkspaceKey: testOrganizationID, Grain: []string{"p2", "code-review"}}).ID() ||
		prompt.Id != (ai.CanonicalKey{Kind: ai.IDKindPrompt, Provider: aiProviderClaude, WorkspaceKey: testOrganizationID, Grain: []string{"p2"}}).ID() {
		t.Fatalf("prompt or skill id is not canonical: %q %q", prompt.Id, skill.Id)
	}

	command := buildPromptRollup(testOrganizationID, "p3", fixturePromptEvents(t, "p3")).prompt
	if command.CommandName != "review" || command.CommandSource != "builtin" || command.UsedSkill {
		t.Fatalf("command prompt = %q %q used skill %t", command.CommandName, command.CommandSource, command.UsedSkill)
	}
}

// Each api_error and failed tool_result becomes one failure row with its reason. A tool
// error's message is stripped at ingest, so only its error type reaches the row; successful
// tool calls add none.
func TestBuildPromptRollupRecordsFailureReasons(t *testing.T) {
	events := fixturePromptEvents(t, "p2")
	rollup := buildPromptRollup(testOrganizationID, "p2", events)
	prompt := rollup.prompt
	if int64(len(rollup.failures)) != prompt.ApiErrorCount+prompt.ToolFailureCount || len(rollup.failures) != 2 {
		t.Fatalf("failures = %d, want one per api error (%d) and tool failure (%d)", len(rollup.failures), prompt.ApiErrorCount, prompt.ToolFailureCount)
	}
	byKind := make(map[string]*ai.AiPromptFailure)
	for _, failure := range rollup.failures {
		byKind[failure.FailureKind] = failure
		if failure.AiPromptId != prompt.Id || failure.PromptId != "p2" || failure.SessionId != "sess-1" || failure.UserKey != prompt.UserKey || failure.WorkspaceKey != testOrganizationID {
			t.Fatalf("failure identity = %#v, want prompt %q", failure, prompt.Id)
		}
	}

	api := byKind[ai.FailureKindApiError]
	if api == nil || api.Model != "claude-opus-5-5" || api.ErrorMessage != "overloaded" || int64Value(api.StatusCode) != 529 || int64Value(api.Attempt) != 1 || api.ToolName != "" {
		t.Fatalf("api failure = %#v", api)
	}
	tool := byKind[ai.FailureKindToolError]
	if tool == nil || tool.ToolName != "Bash" || tool.ErrorType != "ShellError" || tool.ErrorMessage != "" || tool.StatusCode != nil {
		t.Fatalf("tool failure = %#v", tool)
	}
	apiEvent := firstEventNamed(t, events, eventAPIError)
	if api.Id != (ai.CanonicalKey{Kind: ai.IDKindPromptFailure, Provider: aiProviderClaude, WorkspaceKey: testOrganizationID, Grain: []string{"p2", hex.EncodeToString(apiEvent.EventKey)}}).ID() ||
		!api.OccurredAt.Equal(apiEvent.EventTimestamp) {
		t.Fatalf("api failure id/time = %q %s, want canonical id of its event", api.Id, api.OccurredAt)
	}

	if failures := buildPromptRollup(testOrganizationID, "p1", fixturePromptEvents(t, "p1")).failures; len(failures) != 0 {
		t.Fatalf("p1 failures = %d, want none", len(failures))
	}
}

// The repository URL comes from the prompt's events. A prompt without one, or with one that
// does not fit its column, stores NULL instead of failing or truncating.
func TestPromptRollupRecordsRepositoryURL(t *testing.T) {
	const repository = "https://github.com/example-org/example-repo"
	request := loadLogEventsFixture(t)
	stripContentAttributes(request)
	records := resourceLogRecords(request.GetResourceLogs()[0])
	for _, index := range []int{3, 4, 5, 6, 7, 8, 9} { // p2, sent with credentials and mixed case
		setStringAttribute(records[index], repositoryURLAttribute, "https://user:ghp_secret@GitHub.com/Example-Org/example-repo.git")
	}
	setStringAttribute(records[0], repositoryURLAttribute, "https://github.com/"+strings.Repeat("r", maxRepositoryURLLength)) // p1
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})
	prepared, err := newRawConverter(database, nil).prepareEvents(request, 1)
	if err != nil {
		t.Fatalf("prepareEvents() error = %v", err)
	}
	byPrompt := make(map[string][]*models.OtelEvent)
	for _, item := range prepared.events {
		byPrompt[item.event.PromptId] = append(byPrompt[item.event.PromptId], item.event)
	}

	if got := buildPromptRollup(testOrganizationID, "p2", byPrompt["p2"]).prompt.RepositoryUrl; got == nil || *got != repository {
		t.Fatalf("p2 repository = %v, want %q", got, repository)
	}
	for _, promptID := range []string{"p1", "p3"} {
		if got := buildPromptRollup(testOrganizationID, promptID, byPrompt[promptID]).prompt.RepositoryUrl; got != nil {
			t.Fatalf("%s repository = %q, want nil", promptID, *got)
		}
	}
}

// The api_request effort attribute is kept on the stored event and becomes the prompt's
// effort. A prompt whose requests report no effort, or that made none, has none.
func TestPromptRollupRecordsEffort(t *testing.T) {
	request := loadLogEventsFixture(t)
	stripContentAttributes(request)
	records := resourceLogRecords(request.GetResourceLogs()[0])
	setStringAttribute(records[1], "effort", "high") // p1's api_request
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})
	prepared, err := newRawConverter(database, nil).prepareEvents(request, 1)
	if err != nil {
		t.Fatalf("prepareEvents() error = %v", err)
	}
	byPrompt := make(map[string][]*models.OtelEvent)
	for _, item := range prepared.events {
		byPrompt[item.event.PromptId] = append(byPrompt[item.event.PromptId], item.event)
	}

	if got := eventString(eventAttributes(firstEventNamed(t, byPrompt["p1"], eventAPIRequest)), "effort"); got != "high" {
		t.Fatalf("stored p1 api_request effort = %q, want %q", got, "high")
	}
	for _, test := range []struct {
		promptID string
		want     string
	}{
		{"p1", "high"},
		{"p2", ""}, // its api_request reports no effort
		{"p3", ""}, // no api_request
	} {
		t.Run(test.promptID, func(t *testing.T) {
			got := buildPromptRollup(testOrganizationID, test.promptID, byPrompt[test.promptID]).prompt.Effort
			if gotValue := stringValue(got); gotValue != test.want || (test.want == "") != (got == nil) {
				t.Fatalf("%s effort = %v, want %q", test.promptID, got, test.want)
			}
		})
	}
}

// The main conversation's effort wins over background requests such as session titles,
// which may run at another level. Background effort is used only while the prompt has no
// main-thread effort.
func TestPromptBuilderApplyEffort(t *testing.T) {
	type request struct{ querySource, effort string }
	for _, test := range []struct {
		name     string
		requests []request
		want     string
	}{
		{"main thread after background", []request{{"generate_session_title", "low"}, {mainThreadQuerySource, "high"}, {mainThreadQuerySource, "max"}}, "high"},
		{"main thread before background", []request{{mainThreadQuerySource, "xhigh"}, {"generate_session_title", "low"}}, "xhigh"},
		{"background only", []request{{"generate_session_title", "low"}, {"away_summary", "medium"}}, "low"},
		{"main thread without effort", []request{{mainThreadQuerySource, ""}, {"away_summary", "medium"}}, "medium"},
		{"no query source", []request{{"", "medium"}}, "medium"},
		{"no effort", []request{{mainThreadQuerySource, ""}}, ""},
		{"no requests", nil, ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			builder := &promptBuilder{prompt: &ai.AiPrompt{}}
			for _, r := range test.requests {
				builder.applyEffort(r.querySource, r.effort)
			}
			got := builder.prompt.Effort
			if gotValue := stringValue(got); gotValue != test.want || (test.want == "") != (got == nil) {
				t.Fatalf("effort = %v, want %q", got, test.want)
			}
		})
	}
}

// The rollup reloads a prompt's stored events with rollupEventColumns, so every column it
// reads must be in it. Without query_source, every reloaded request looks like background
// work and a session-title request could decide the prompt's effort. Without event_key,
// every failure of a prompt gets the same id and only one row survives.
func TestRollupEventColumnsLoadRollupInputs(t *testing.T) {
	columns := make(map[string]struct{})
	for _, column := range strings.Split(strings.ReplaceAll(rollupEventColumnsSQL(), " ", ""), ",") {
		columns[column] = struct{}{}
	}
	for _, test := range []struct {
		reader string
		column string
	}{
		{"effort", "query_source"},
		{"effort", "attributes"},
		{"failure id", "event_key"},
		{"tool failure", "success"},
		{"tool failure", "tool_name"},
		{"api failure", "model"},
		{"failure duration", "duration_ms"},
	} {
		t.Run(test.reader+"/"+test.column, func(t *testing.T) {
			if _, found := columns[test.column]; !found {
				t.Errorf("rollup event columns = %q, missing %s", rollupEventColumnsSQL(), test.column)
			}
		})
	}
}

// firstEventNamed returns the first of a prompt's events with the given name.
func firstEventNamed(t *testing.T, events []*models.OtelEvent, eventName string) *models.OtelEvent {
	t.Helper()
	for _, event := range events {
		if event.EventName == eventName {
			return event
		}
	}
	t.Fatalf("no %s event among %d events", eventName, len(events))
	return nil
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

// An event whose client clock ran ahead carries an event_timestamp far in the future. Its prompt
// text must still be cleared when its raw batch expires, so the clear selects events by raw
// batch ID only and never by event_timestamp.
func TestDeleteExpiredLogBatchesClearsPromptTextRegardlessOfEventTimestamp(t *testing.T) {
	database := dalmocks.NewDal(t)
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	futureEvent := models.OtelEvent{RawBatchId: 7, EventTimestamp: now.AddDate(5, 0, 0)}
	expiredBatchIDs := []uint64{futureEvent.RawBatchId, 8}
	var calls []string
	database.EXPECT().Pluck("id", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Run(func(_ string, destination interface{}, clauses ...dal.Clause) {
		where := clauses[1].Data.(dal.DalClause)
		if where.Expr != "received_at < ? AND status IN ?" || !where.Params[0].(time.Time).Equal(now.Add(-rawBatchRetention)) {
			t.Fatalf("Pluck() where = %q %v", where.Expr, where.Params)
		}
		*destination.(*[]uint64) = expiredBatchIDs
	}).Return(nil).Once()
	// The generated Run helper cannot pass a nil value through, so read the raw arguments.
	database.On("UpdateColumn", mock.AnythingOfType("*models.OtelEvent"), "prompt_text", nil, mock.Anything).Run(func(args mock.Arguments) {
		where := args.Get(3).(dal.Clause).Data.(dal.DalClause)
		ids, _ := where.Params[0].([]uint64)
		if where.Expr != "raw_batch_id IN ?" || len(ids) != 2 || ids[0] != futureEvent.RawBatchId || ids[1] != 8 {
			t.Fatalf("UpdateColumn() where = %q %v", where.Expr, where.Params)
		}
		calls = append(calls, "clear")
	}).Return(nil).Once()
	database.EXPECT().Delete(mock.AnythingOfType("*models.OtelLogBatch"), mock.Anything).Run(func(_ interface{}, _ ...dal.Clause) {
		calls = append(calls, "delete")
	}).Return(nil).Once()

	if err := newRawConverter(database, nil).deleteExpiredRawBatches(now, &models.OtelLogBatch{}); err != nil {
		t.Fatalf("deleteExpiredRawBatches() error = %v", err)
	}
	if strings.Join(calls, ",") != "clear,delete" {
		t.Fatalf("calls = %v; want prompt text cleared before the batches are deleted", calls)
	}
}

func TestDeleteExpiredMetricBatchesLeavesEventsAlone(t *testing.T) {
	database := dalmocks.NewDal(t)
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	database.EXPECT().Pluck("id", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Run(func(_ string, destination interface{}, _ ...dal.Clause) {
		*destination.(*[]uint64) = []uint64{3}
	}).Return(nil).Once()
	database.EXPECT().Delete(mock.AnythingOfType("*models.OtelMetricBatch"), mock.Anything).Return(nil).Once()

	if err := newRawConverter(database, nil).deleteExpiredRawBatches(now, &models.OtelMetricBatch{}); err != nil {
		t.Fatalf("deleteExpiredRawBatches() error = %v", err)
	}
}

func rollupEventColumnsSQL() string {
	return rollupEventColumns.Data.(dal.DalClause).Expr
}

func TestSessionTargetsGroupPromptsAndFlagModeChanges(t *testing.T) {
	request := loadLogEventsFixture(t)
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})
	prepared, err := newRawConverter(database, nil).prepareEvents(request, 1)
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
	prepared, err := newRawConverter(database, nil).prepareEvents(request, 1)
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

func TestTypedAttributeReaders(t *testing.T) {
	str := func(v string) *commonv1.AnyValue {
		return &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: v}}
	}
	num := func(v float64) *commonv1.AnyValue {
		return &commonv1.AnyValue{Value: &commonv1.AnyValue_DoubleValue{DoubleValue: v}}
	}
	integer := func(v int64) *commonv1.AnyValue {
		return &commonv1.AnyValue{Value: &commonv1.AnyValue_IntValue{IntValue: v}}
	}
	boolean := func(v bool) *commonv1.AnyValue {
		return &commonv1.AnyValue{Value: &commonv1.AnyValue_BoolValue{BoolValue: v}}
	}
	show := func(value interface{}) string {
		switch typed := value.(type) {
		case *int64:
			if typed != nil {
				return fmt.Sprint(*typed)
			}
		case *bool:
			if typed != nil {
				return fmt.Sprint(*typed)
			}
		case *string:
			if typed != nil {
				return *typed
			}
		}
		return "nil"
	}
	tests := []struct {
		name  string
		read  func([]*commonv1.KeyValue, string) interface{}
		value *commonv1.AnyValue
		want  string
	}{
		{"int keeps large ints exact", readInt, integer(math.MaxInt64), "9223372036854775807"},
		{"int truncates a double", readInt, num(12.9), "12"},
		{"int parses a numeric string", readInt, str(" 7.5 "), "7"},
		{"int rejects NaN", readInt, num(math.NaN()), "nil"},
		{"int rejects an out-of-range string", readInt, str("1e19"), "nil"},
		{"int rejects a bool", readInt, boolean(true), "nil"},
		{"bool reads a bool", readBool, boolean(false), "false"},
		{"bool parses a string", readBool, str("true"), "true"},
		{"bool rejects a number", readBool, integer(1), "nil"},
		{"decimal formats an int", readDecimal, integer(3), "3.00000000"},
		{"decimal parses a string", readDecimal, str("0.25"), "0.25000000"},
		{"decimal rejects a negative", readDecimal, num(-1), "nil"},
		{"decimal rejects infinity", readDecimal, num(math.Inf(1)), "nil"},
		{"decimal rejects 1e12", readDecimal, num(1e12), "nil"},
		{"missing attribute", readInt, nil, "nil"},
	}
	for _, test := range tests {
		attributes := []*commonv1.KeyValue{{Key: "other", Value: integer(1)}}
		if test.value != nil {
			attributes = append(attributes, &commonv1.KeyValue{Key: "value", Value: test.value})
		}
		if got := show(test.read(attributes, "value")); got != test.want {
			t.Errorf("%s: got %s, want %s", test.name, got, test.want)
		}
	}
}

func readInt(attributes []*commonv1.KeyValue, key string) interface{} {
	return attributeInt(attributes, key)
}

func readBool(attributes []*commonv1.KeyValue, key string) interface{} {
	return attributeBool(attributes, key)
}

func readDecimal(attributes []*commonv1.KeyValue, key string) interface{} {
	return attributeDecimal(attributes, key, 8)
}
