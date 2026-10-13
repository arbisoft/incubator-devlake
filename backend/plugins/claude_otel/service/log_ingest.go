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
	"crypto/sha256"
	"net/http"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	collectorlogs "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	logsv1 "go.opentelemetry.io/proto/otlp/logs/v1"
	"google.golang.org/protobuf/proto"
)

const (
	eventNameAttribute   = "event.name"
	claudeCodeEventScope = "claude_code."

	eventUserPrompt   = "claude_code.user_prompt"
	eventAPIRequest   = "claude_code.api_request"
	eventAPIError     = "claude_code.api_error"
	eventAPIRefusal   = "claude_code.api_refusal"
	eventToolResult   = "claude_code.tool_result"
	eventToolDecision = "claude_code.tool_decision"
)

// supportedLogEvents are the Claude Code events converted into prompt facts. Every other
// event is dropped at ingest, so raw storage holds nothing DevLake does not use.
var supportedLogEvents = map[string]struct{}{
	eventUserPrompt: {}, eventAPIRequest: {}, eventAPIError: {},
	eventAPIRefusal: {}, eventToolResult: {}, eventToolDecision: {},
}

const (
	promptAttribute     = "prompt"
	promptTextAttribute = "prompt_text"
	// redactedPrompt is what Claude Code sends in place of the text when the developer has
	// not opted in with OTEL_LOG_USER_PROMPTS=1.
	redactedPrompt = "<REDACTED>"
)

// logContentAttributes carry model responses, tool inputs or error text. They are removed
// before storage even when a developer turns on OTEL_LOG_TOOL_DETAILS; the Collector
// removes them too. Prompt text is kept for developers who opted in; see promptText.
var logContentAttributes = map[string]struct{}{
	"response": {}, "body": {}, "tool_input": {}, "tool_parameters": {}, "error": {},
}

// IngestLogs stores the supported Claude Code events of one authenticated OTLP Logs
// request, without response, tool or error content. Prompt text is kept for developers
// with OTEL_LOG_USER_PROMPTS=1. A request with no supported event is accepted without
// storing a batch.
func (s *RawIngestService) IngestLogs(request *http.Request) (*RawIngestResult, errors.Error) {
	body, err := s.readAuthenticatedBody(request)
	if err != nil {
		return nil, err
	}
	logsRequest := &collectorlogs.ExportLogsServiceRequest{}
	if err := proto.Unmarshal(body, logsRequest); err != nil {
		return nil, errors.BadInput.New("invalid OTLP logs protobuf payload")
	}
	resourceCount, recordCount, err := sanitizeOtelLogsRequest(logsRequest)
	if err != nil {
		return nil, err
	}
	if recordCount == 0 {
		return &RawIngestResult{}, nil
	}
	minObservedAt, maxObservedAt := logObservedTimeRange(logsRequest.GetResourceLogs())
	deterministicPayload, marshalErr := proto.MarshalOptions{Deterministic: true}.Marshal(logsRequest)
	if marshalErr != nil {
		return nil, errors.Default.Wrap(marshalErr, "failed to canonicalize OTLP logs payload")
	}
	payloadHash := sha256.Sum256(deterministicPayload)
	batch := &models.OtelLogBatch{
		ReceivedAt:           s.now().UTC(),
		PayloadSha256:        payloadHash[:],
		PayloadProto:         deterministicPayload,
		PayloadSchemaVersion: otelPayloadSchemaVersion,
		ResourceCount:        resourceCount,
		RecordCount:          recordCount,
		MinObservedAt:        minObservedAt,
		MaxObservedAt:        maxObservedAt,
		Status:               models.OtelMetricBatchStatusPending,
	}
	duplicate, err := s.createRawBatch(batch)
	if err != nil {
		return nil, err
	}
	if duplicate {
		return &RawIngestResult{Duplicate: true}, nil
	}
	return &RawIngestResult{BatchID: batch.ID}, nil
}

// sanitizeOtelLogsRequest keeps only supported events, strips their content, and drops
// scopes and resources left empty. It returns the remaining resource and record counts.
func sanitizeOtelLogsRequest(request *collectorlogs.ExportLogsServiceRequest) (int, int, errors.Error) {
	if len(request.GetResourceLogs()) == 0 {
		return 0, 0, errors.BadInput.New("OTLP logs request contains no resource logs")
	}
	resources := make([]*logsv1.ResourceLogs, 0, len(request.GetResourceLogs()))
	recordCount := 0
	for _, resourceLogs := range request.GetResourceLogs() {
		if resourceLogs.GetResource() == nil {
			return 0, 0, errors.BadInput.New("OTLP logs resource is required")
		}
		scopes := make([]*logsv1.ScopeLogs, 0, len(resourceLogs.GetScopeLogs()))
		for _, scopeLogs := range resourceLogs.GetScopeLogs() {
			records := make([]*logsv1.LogRecord, 0, len(scopeLogs.GetLogRecords()))
			for _, record := range scopeLogs.GetLogRecords() {
				if sanitizeLogRecord(record) {
					records = append(records, record)
				}
			}
			if len(records) > 0 {
				scopeLogs.LogRecords = records
				scopes = append(scopes, scopeLogs)
				recordCount += len(records)
			}
		}
		if len(scopes) > 0 {
			resourceLogs.ScopeLogs = scopes
			resources = append(resources, resourceLogs)
		}
	}
	request.ResourceLogs = resources
	return len(resources), recordCount, nil
}

// sanitizeLogRecord reports whether the record is a supported event and, if so, strips it
// in place: the content attributes in logContentAttributes, the body, and unknown protobuf
// fields. Other attributes are kept as sent. The event name is kept as an attribute, and
// an opted-in prompt's text is kept once, as the prompt attribute.
func sanitizeLogRecord(record *logsv1.LogRecord) bool {
	eventName := logEventName(record)
	if _, supported := supportedLogEvents[eventName]; !supported {
		return false
	}
	text := ""
	if eventName == eventUserPrompt {
		text = promptText(record.GetAttributes())
	}
	attributes := make([]*commonv1.KeyValue, 0, len(record.GetAttributes())+2)
	for _, attribute := range record.GetAttributes() {
		switch attribute.GetKey() {
		case eventNameAttribute, promptAttribute, promptTextAttribute:
			continue
		}
		if _, content := logContentAttributes[attribute.GetKey()]; content {
			continue
		}
		attributes = append(attributes, attribute)
	}
	attributes = append(attributes, stringKeyValue(eventNameAttribute, eventName))
	if text != "" {
		attributes = append(attributes, stringKeyValue(promptAttribute, text))
	}
	record.Attributes = attributes
	record.Body = nil
	record.ProtoReflect().SetUnknown(nil)
	return true
}

// promptText returns the prompt as typed, from prompt or else prompt_text, or "" when the
// developer has not opted in and Claude Code sent the redaction placeholder.
func promptText(attributes []*commonv1.KeyValue) string {
	for _, key := range []string{promptAttribute, promptTextAttribute} {
		for _, attribute := range attributes {
			if attribute.GetKey() != key {
				continue
			}
			if text := attribute.GetValue().GetStringValue(); strings.TrimSpace(text) != "" && text != redactedPrompt {
				return text
			}
		}
	}
	return ""
}

func stringKeyValue(key, value string) *commonv1.KeyValue {
	return &commonv1.KeyValue{Key: key, Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: value}}}
}

// logEventName returns the event's claude_code.-prefixed name. Claude Code sends the bare
// name in event.name ("api_request") and the prefixed name as the body; a body is used only
// when it holds nothing but an event name.
func logEventName(record *logsv1.LogRecord) string {
	if name := attributeString(record.GetAttributes(), eventNameAttribute); name != "" {
		if !strings.HasPrefix(name, claudeCodeEventScope) {
			name = claudeCodeEventScope + name
		}
		return name
	}
	body := strings.TrimSpace(record.GetBody().GetStringValue())
	if strings.HasPrefix(body, claudeCodeEventScope) && !strings.ContainsAny(body, " \t\n") {
		return body
	}
	return ""
}

// logRecordTime is the event time, or the time the SDK observed it when unset.
func logRecordTime(record *logsv1.LogRecord) (time.Time, error) {
	if record.GetTimeUnixNano() != 0 {
		return unixNanoTime(record.GetTimeUnixNano())
	}
	return unixNanoTime(record.GetObservedTimeUnixNano())
}

func logObservedTimeRange(resourceLogs []*logsv1.ResourceLogs) (*time.Time, *time.Time) {
	var minObservedAt, maxObservedAt *time.Time
	for _, resource := range resourceLogs {
		for _, scope := range resource.GetScopeLogs() {
			for _, record := range scope.GetLogRecords() {
				observedAt, err := logRecordTime(record)
				if err != nil {
					continue
				}
				if minObservedAt == nil || observedAt.Before(*minObservedAt) {
					minObservedAt = &observedAt
				}
				if maxObservedAt == nil || observedAt.After(*maxObservedAt) {
					maxObservedAt = &observedAt
				}
			}
		}
	}
	return minObservedAt, maxObservedAt
}
