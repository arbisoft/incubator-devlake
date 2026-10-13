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
	"net/http"
	"net/http/httptest"
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
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

const testLogTime = uint64(1_791_799_200_000_000_000)

func newLogRecord(eventName string, attributes ...*commonv1.KeyValue) *logsv1.LogRecord {
	if eventName != "" {
		attributes = append([]*commonv1.KeyValue{stringAttribute(eventNameAttribute, eventName)}, attributes...)
	}
	return &logsv1.LogRecord{TimeUnixNano: testLogTime, Attributes: attributes}
}

func newOtelLogsRequest(resources ...[]*logsv1.LogRecord) *collectorlogs.ExportLogsServiceRequest {
	request := &collectorlogs.ExportLogsServiceRequest{}
	for _, records := range resources {
		request.ResourceLogs = append(request.ResourceLogs, &logsv1.ResourceLogs{
			Resource:  &resourcev1.Resource{Attributes: []*commonv1.KeyValue{stringAttribute("service.version", "2.1.0")}},
			ScopeLogs: []*logsv1.ScopeLogs{{LogRecords: records}},
		})
	}
	return request
}

func newLogsHTTPRequest(t *testing.T, payload []byte, token string) *http.Request {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/plugins/claude_otel/otlp/v1/logs", bytes.NewReader(payload))
	request.Header.Set("Content-Type", otlpProtobufContentType)
	request.Header.Set(claudeOtelIngestTokenHeader, token)
	return request
}

func marshalLogs(t *testing.T, request *collectorlogs.ExportLogsServiceRequest) []byte {
	t.Helper()
	payload, err := proto.Marshal(request)
	if err != nil {
		t.Fatalf("proto.Marshal() error = %v", err)
	}
	return payload
}

// ingestAndCapture ingests the request and returns the stored batch and its decoded payload.
func ingestAndCapture(t *testing.T, request *collectorlogs.ExportLogsServiceRequest) (*models.OtelLogBatch, *collectorlogs.ExportLogsServiceRequest) {
	t.Helper()
	service, database := newRawIngestService(t)
	transaction := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(transaction)
	var stored *models.OtelLogBatch
	transaction.EXPECT().Create(mock.AnythingOfType("*models.OtelLogBatch")).Run(func(batch interface{}, _ ...dal.Clause) {
		stored = batch.(*models.OtelLogBatch)
		stored.ID = 7
	}).Return(nil)
	transaction.EXPECT().Commit().Return(nil)

	result, err := service.IngestLogs(newLogsHTTPRequest(t, marshalLogs(t, request), "collector-token"))
	if err != nil || result.BatchID != 7 || result.Duplicate {
		t.Fatalf("IngestLogs() = %#v, %v, want batch 7", result, err)
	}
	decoded := &collectorlogs.ExportLogsServiceRequest{}
	if err := proto.Unmarshal(stored.PayloadProto, decoded); err != nil {
		t.Fatalf("stored payload does not decode: %v", err)
	}
	return stored, decoded
}

func storedRecords(request *collectorlogs.ExportLogsServiceRequest) []*logsv1.LogRecord {
	records := make([]*logsv1.LogRecord, 0)
	for _, resource := range request.GetResourceLogs() {
		for _, scope := range resource.GetScopeLogs() {
			records = append(records, scope.GetLogRecords()...)
		}
	}
	return records
}

func TestLogIngestKeepsPromptTextAndDropsOtherContent(t *testing.T) {
	prompt := newLogRecord(eventUserPrompt,
		stringAttribute("prompt.id", "prompt-1"),
		stringAttribute("prompt", "deploy with password hunter2"),
		stringAttribute("prompt_text", "deploy with password hunter2"),
		&commonv1.KeyValue{Key: "prompt_length", Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_IntValue{IntValue: 28}}},
	)
	prompt.Body = &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: "deploy with password hunter2"}}
	tool := newLogRecord(eventToolResult,
		stringAttribute("prompt.id", "prompt-1"),
		stringAttribute("tool_name", "Bash"),
		stringAttribute("tool_input", `{"command":"cat .env"}`),
		stringAttribute("tool_parameters", `{"command":"cat .env"}`),
		stringAttribute("error", "permission denied reading .env"),
	)
	response := newLogRecord("claude_code.assistant_response", stringAttribute("response", "Here is the password"))

	batch, stored := ingestAndCapture(t, newOtelLogsRequest([]*logsv1.LogRecord{prompt, tool, response}))

	records := storedRecords(stored)
	if batch.RecordCount != 2 || batch.ResourceCount != 1 || len(records) != 2 {
		t.Fatalf("stored %d records in %d resources (counts %d/%d), want the 2 supported events", len(records), len(stored.GetResourceLogs()), batch.RecordCount, batch.ResourceCount)
	}
	for _, record := range records {
		if record.GetBody() != nil {
			t.Errorf("%s kept its body", logEventName(record))
		}
		for _, attribute := range record.GetAttributes() {
			if _, content := logContentAttributes[attribute.GetKey()]; content {
				t.Errorf("%s kept content attribute %q", logEventName(record), attribute.GetKey())
			}
		}
	}
	// The opted-in prompt is kept once and unmasked; the body copy and prompt_text are not.
	if got := bytes.Count(batch.PayloadProto, []byte("deploy with password hunter2")); got != 1 {
		t.Fatalf("stored payload has the prompt text %d times, want once", got)
	}
	if attributeString(records[0].GetAttributes(), promptAttribute) != "deploy with password hunter2" || hasAttribute(records[0].GetAttributes(), promptTextAttribute) {
		t.Fatalf("user_prompt attributes = %v, want the text as prompt only", records[0].GetAttributes())
	}
	if bytes.Contains(batch.PayloadProto, []byte(".env")) || bytes.Contains(batch.PayloadProto, []byte("Here is the password")) {
		t.Fatal("stored payload still contains tool or response content")
	}
	if attributeString(records[0].GetAttributes(), "prompt.id") != "prompt-1" || logEventName(records[1]) != eventToolResult {
		t.Fatalf("non-content attributes were lost: %v / %v", records[0].GetAttributes(), records[1].GetAttributes())
	}
	if batch.MinObservedAt == nil || batch.MaxObservedAt == nil || batch.Status != models.OtelMetricBatchStatusPending {
		t.Fatalf("batch = %+v, want time bounds and pending status", batch)
	}
}

// The shape Claude Code 2.1 sends: bare event.name, prefixed body, redacted prompt, and
// numbers as either strings or numeric values.
func TestLogIngestAcceptsClaudeCodeEventShape(t *testing.T) {
	prompt := &logsv1.LogRecord{
		TimeUnixNano: testLogTime,
		Body:         &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: eventUserPrompt}},
		Attributes: []*commonv1.KeyValue{
			stringAttribute(sessionIDAttribute, "a7f627e1-cce4-4913-a444-dd503d4b1fd4"),
			stringAttribute(eventNameAttribute, "user_prompt"),
			stringAttribute("prompt.id", "efa8812c-bb35-4d41-90cb-0ec145c35fc4"),
			stringAttribute("prompt_length", "63"),
			stringAttribute("prompt", "<REDACTED>"),
			stringAttribute("prompt_text", "<REDACTED>"),
		},
	}
	plugin := &logsv1.LogRecord{
		TimeUnixNano: testLogTime,
		Body:         &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: "claude_code.plugin_loaded"}},
		Attributes:   []*commonv1.KeyValue{stringAttribute(eventNameAttribute, "plugin_loaded")},
	}

	batch, stored := ingestAndCapture(t, newOtelLogsRequest([]*logsv1.LogRecord{prompt, plugin}))

	records := storedRecords(stored)
	if batch.RecordCount != 1 || attributeString(records[0].GetAttributes(), eventNameAttribute) != eventUserPrompt {
		t.Fatalf("records = %v, want only user_prompt, stored as %s", records, eventUserPrompt)
	}
	// Not opted in: the redaction placeholder is not stored as prompt text.
	if hasAttribute(records[0].GetAttributes(), promptAttribute) || hasAttribute(records[0].GetAttributes(), promptTextAttribute) || records[0].GetBody() != nil {
		t.Fatalf("user_prompt kept the placeholder or body: %v", records[0])
	}
}

func TestLogIngestKeepsPromptTextSentOnlyAsPromptText(t *testing.T) {
	request := newOtelLogsRequest([]*logsv1.LogRecord{newLogRecord(eventUserPrompt,
		stringAttribute("prompt.id", "prompt-1"), stringAttribute(promptAttribute, redactedPrompt),
		stringAttribute(promptTextAttribute, "refactor the auth middleware"),
	)})

	_, stored := ingestAndCapture(t, request)

	attributes := storedRecords(stored)[0].GetAttributes()
	if attributeString(attributes, promptAttribute) != "refactor the auth middleware" || hasAttribute(attributes, promptTextAttribute) {
		t.Fatalf("attributes = %v, want the prompt_text value stored as prompt", attributes)
	}
}

func TestLogIngestStoresPromptTextOnlyOnUserPrompt(t *testing.T) {
	request := newOtelLogsRequest([]*logsv1.LogRecord{newLogRecord(eventAPIRequest, stringAttribute(promptAttribute, "not a prompt event"))})

	_, stored := ingestAndCapture(t, request)

	if hasAttribute(storedRecords(stored)[0].GetAttributes(), promptAttribute) {
		t.Fatal("a prompt attribute on a non-prompt event was kept")
	}
}

func TestLogIngestKeepsEveryNonContentAttribute(t *testing.T) {
	request := newOtelLogsRequest([]*logsv1.LogRecord{newLogRecord(eventAPIRequest,
		stringAttribute("prompt.id", "prompt-1"), stringAttribute("model", "claude-opus-5-5"),
		stringAttribute("cost_usd", "0.012"), stringAttribute("input_tokens", "120"),
	)})

	_, stored := ingestAndCapture(t, request)

	attributes := storedRecords(stored)[0].GetAttributes()
	for _, key := range []string{eventNameAttribute, "prompt.id", "model", "cost_usd", "input_tokens"} {
		if !hasAttribute(attributes, key) {
			t.Errorf("attribute %q was dropped", key)
		}
	}
	if len(attributes) != 5 {
		t.Fatalf("attributes = %v, want exactly the 5 sent, with event.name once", attributes)
	}
}

func TestLogIngestReadsEventNameFromBodyOnly(t *testing.T) {
	named := &logsv1.LogRecord{TimeUnixNano: testLogTime, Body: &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: eventAPIError}}}
	// Free text in the body is never treated as an event name, so the record is dropped.
	text := &logsv1.LogRecord{TimeUnixNano: testLogTime, Body: &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: "claude_code.user_prompt fix the login bug"}}}

	batch, stored := ingestAndCapture(t, newOtelLogsRequest([]*logsv1.LogRecord{named, text}))

	records := storedRecords(stored)
	if batch.RecordCount != 1 || attributeString(records[0].GetAttributes(), eventNameAttribute) != eventAPIError || records[0].GetBody() != nil {
		t.Fatalf("records = %v, want only the api_error with event.name moved to an attribute", records)
	}
}

func TestLogIngestDropsFieldsUnknownToThisSchema(t *testing.T) {
	record := newLogRecord(eventUserPrompt, stringAttribute("prompt.id", "prompt-1"))
	// A field a newer client adds, carrying text this version cannot inspect.
	unknown := protowire.AppendTag(nil, 99, protowire.BytesType)
	unknown = protowire.AppendString(unknown, "secret prompt text")
	record.ProtoReflect().SetUnknown(unknown)

	batch, _ := ingestAndCapture(t, newOtelLogsRequest([]*logsv1.LogRecord{record}))

	if bytes.Contains(batch.PayloadProto, []byte("secret prompt text")) {
		t.Fatal("stored payload kept an unknown field")
	}
}

func TestLogIngestDropsResourcesLeftEmpty(t *testing.T) {
	request := newOtelLogsRequest(
		[]*logsv1.LogRecord{newLogRecord("claude_code.plugin_loaded")},
		[]*logsv1.LogRecord{newLogRecord(eventToolDecision, stringAttribute("prompt.id", "prompt-1"))},
	)

	batch, stored := ingestAndCapture(t, request)

	if batch.ResourceCount != 1 || len(stored.GetResourceLogs()) != 1 {
		t.Fatalf("stored %d resources, want only the one with a supported event", len(stored.GetResourceLogs()))
	}
}

func TestLogIngestAcceptsRequestWithoutSupportedEventsWithoutStoring(t *testing.T) {
	service, _ := newRawIngestService(t)
	request := newOtelLogsRequest([]*logsv1.LogRecord{newLogRecord("claude_code.plugin_loaded"), newLogRecord("")})

	// The Dal mock has no expectations, so any storage call fails the test.
	result, err := service.IngestLogs(newLogsHTTPRequest(t, marshalLogs(t, request), "collector-token"))
	if err != nil || result.BatchID != 0 || result.Duplicate {
		t.Fatalf("IngestLogs() = %#v, %v, want success with nothing stored", result, err)
	}
}

func TestLogIngestTreatsDuplicatePayloadAsSuccess(t *testing.T) {
	service, database := newRawIngestService(t)
	transaction := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(transaction)
	transaction.EXPECT().Create(mock.AnythingOfType("*models.OtelLogBatch")).Return(errors.Default.New("duplicate key"))
	transaction.EXPECT().Rollback().Return(nil)
	database.EXPECT().IsDuplicationError(mock.Anything).Return(true)

	request := newOtelLogsRequest([]*logsv1.LogRecord{newLogRecord(eventAPIRequest)})
	result, err := service.IngestLogs(newLogsHTTPRequest(t, marshalLogs(t, request), "collector-token"))
	if err != nil || !result.Duplicate {
		t.Fatalf("IngestLogs() = %#v, %v, want a duplicate success", result, err)
	}
}

func TestLogIngestReturnsUnavailableWhenStorageFails(t *testing.T) {
	service, database := newRawIngestService(t)
	transaction := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(transaction)
	transaction.EXPECT().Create(mock.AnythingOfType("*models.OtelLogBatch")).Return(errors.Default.New("disk full"))
	transaction.EXPECT().Rollback().Return(nil)
	database.EXPECT().IsDuplicationError(mock.Anything).Return(false)

	request := newOtelLogsRequest([]*logsv1.LogRecord{newLogRecord(eventAPIRequest)})
	_, err := service.IngestLogs(newLogsHTTPRequest(t, marshalLogs(t, request), "collector-token"))
	if err == nil || err.GetType().GetHttpCode() != http.StatusServiceUnavailable {
		t.Fatalf("IngestLogs() error = %v, want 503 so the Collector retries", err)
	}
}

func TestLogIngestRejectsInvalidRequests(t *testing.T) {
	valid := marshalLogs(t, newOtelLogsRequest([]*logsv1.LogRecord{newLogRecord(eventAPIRequest)}))
	noResource := marshalLogs(t, &collectorlogs.ExportLogsServiceRequest{ResourceLogs: []*logsv1.ResourceLogs{{}}})
	for _, testCase := range []struct {
		name    string
		payload []byte
		token   string
		status  int
	}{
		{name: "missing token", payload: valid, status: http.StatusUnauthorized},
		{name: "invalid token", payload: valid, token: "incorrect", status: http.StatusForbidden},
		{name: "malformed payload", payload: []byte("not protobuf"), token: "collector-token", status: http.StatusBadRequest},
		{name: "no resource logs", payload: marshalLogs(t, &collectorlogs.ExportLogsServiceRequest{}), token: "collector-token", status: http.StatusBadRequest},
		{name: "missing resource", payload: noResource, token: "collector-token", status: http.StatusBadRequest},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			service, _ := newRawIngestService(t)
			_, err := service.IngestLogs(newLogsHTTPRequest(t, testCase.payload, testCase.token))
			if err == nil || err.GetType().GetHttpCode() != testCase.status {
				t.Fatalf("IngestLogs() error = %v, want HTTP %d", err, testCase.status)
			}
		})
	}
}

func TestLogIngestUsesObservedTimeWhenEventTimeIsUnset(t *testing.T) {
	observed := testLogTime + uint64(time.Minute)
	early := newLogRecord(eventAPIRequest)
	late := newLogRecord(eventToolResult)
	late.TimeUnixNano, late.ObservedTimeUnixNano = 0, observed

	batch, _ := ingestAndCapture(t, newOtelLogsRequest([]*logsv1.LogRecord{early, late}))

	if !batch.MinObservedAt.Equal(time.Unix(0, int64(testLogTime))) || !batch.MaxObservedAt.Equal(time.Unix(0, int64(observed))) {
		t.Fatalf("observed range = %v..%v, want the event time to the observed time", batch.MinObservedAt, batch.MaxObservedAt)
	}
}
