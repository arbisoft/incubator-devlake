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
	promptAttribute     = "prompt"
	promptTextAttribute = "prompt_text"
	// redactedContent is what Claude Code sends in place of content whose gate is off.
	redactedContent = "<REDACTED>"
)

// contentAttributes carry response, tool input or raw API body content. The Collector
// already deletes them; ingest deletes them again so a misconfigured Collector or a client
// with content logging enabled cannot put content into storage. Prompt text is kept in raw
// batches and events, and never written to ai_* tables.
var contentAttributes = map[string]struct{}{
	"response":   {},
	"tool_input": {},
	"body":       {},
	"body_ref":   {},
}

// toolResultContentAttributes are content only on tool_result events, where the full
// error message can echo file contents. On api_error the error is a service message.
var toolResultContentAttributes = map[string]struct{}{
	"error": {},
}

// IngestLogs stores one authenticated OTLP Logs request as a raw batch. Events are derived
// from it asynchronously by the log converter.
func (s *RawIngestService) IngestLogs(request *http.Request) (*RawIngestResult, errors.Error) {
	body, err := s.readAuthenticatedBody(request)
	if err != nil {
		return nil, err
	}
	logsRequest := &collectorlogs.ExportLogsServiceRequest{}
	if err := proto.Unmarshal(body, logsRequest); err != nil {
		return nil, errors.BadInput.New("invalid OTLP logs protobuf payload")
	}
	stripContentAttributes(logsRequest)
	resourceCount, recordCount, err := validateOtelLogsRequest(logsRequest)
	if err != nil {
		return nil, err
	}
	minObservedAt, maxObservedAt := observedLogTimeRange(logsRequest.GetResourceLogs())
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
	duplicate, err := s.insertRawBatch(batch)
	if err != nil {
		return nil, err
	}
	if duplicate {
		return &RawIngestResult{Duplicate: true}, nil
	}
	return &RawIngestResult{BatchID: batch.ID}, nil
}

func validateOtelLogsRequest(request *collectorlogs.ExportLogsServiceRequest) (int, int, errors.Error) {
	resources := request.GetResourceLogs()
	if len(resources) == 0 {
		return 0, 0, errors.BadInput.New("OTLP logs request contains no resource logs")
	}
	recordCount := 0
	for _, resourceLogs := range resources {
		if resourceLogs.GetResource() == nil {
			return 0, 0, errors.BadInput.New("OTLP logs resource is required")
		}
		records := resourceLogRecords(resourceLogs)
		// Attribution is checked per resource group by the converter, as for metrics.
		if len(records) == 0 {
			return 0, 0, errors.BadInput.New("OTLP logs resource contains no log records")
		}
		recordCount += len(records)
	}
	return len(resources), recordCount, nil
}

func resourceLogRecords(resourceLogs *logsv1.ResourceLogs) []*logsv1.LogRecord {
	records := make([]*logsv1.LogRecord, 0)
	for _, scopeLogs := range resourceLogs.GetScopeLogs() {
		records = append(records, scopeLogs.GetLogRecords()...)
	}
	return records
}

// stripContentAttributes removes content attributes from every resource and record, and
// keeps each prompt's text once, as prompt_text.
func stripContentAttributes(request *collectorlogs.ExportLogsServiceRequest) {
	for _, resourceLogs := range request.GetResourceLogs() {
		if resource := resourceLogs.GetResource(); resource != nil {
			resource.Attributes = withoutAttributes(resource.GetAttributes(), contentAttributes)
		}
		for _, record := range resourceLogRecords(resourceLogs) {
			record.Attributes = normalizePromptText(withoutAttributes(record.GetAttributes(), contentAttributes))
			if logEventName(record) == "tool_result" {
				record.Attributes = withoutAttributes(record.GetAttributes(), toolResultContentAttributes)
			}
		}
	}
}

// normalizePromptText keeps one copy of the prompt text. Claude Code 2.1.287+ sends the
// same text as prompt and prompt_text; older clients send only prompt. A redacted value
// carries no text and is dropped.
func normalizePromptText(attributes []*commonv1.KeyValue) []*commonv1.KeyValue {
	text := untrimmedStringAttribute(attributes, promptTextAttribute)
	if text == "" {
		text = untrimmedStringAttribute(attributes, promptAttribute)
	}
	attributes = withoutAttributes(attributes, map[string]struct{}{promptAttribute: {}, promptTextAttribute: {}})
	if strings.TrimSpace(text) == "" || text == redactedContent {
		return attributes
	}
	return append(attributes, &commonv1.KeyValue{
		Key:   promptTextAttribute,
		Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: text}},
	})
}

// untrimmedStringAttribute reads a string attribute exactly as sent, for content.
func untrimmedStringAttribute(attributes []*commonv1.KeyValue, key string) string {
	for _, attribute := range attributes {
		if attribute.GetKey() == key {
			return attribute.GetValue().GetStringValue()
		}
	}
	return ""
}

func withoutAttributes(attributes []*commonv1.KeyValue, keys map[string]struct{}) []*commonv1.KeyValue {
	kept := attributes[:0]
	for _, attribute := range attributes {
		if _, drop := keys[attribute.GetKey()]; !drop {
			kept = append(kept, attribute)
		}
	}
	return kept
}

func observedLogTimeRange(resourceLogs []*logsv1.ResourceLogs) (*time.Time, *time.Time) {
	var minObservedAt, maxObservedAt *time.Time
	for _, resource := range resourceLogs {
		for _, record := range resourceLogRecords(resource) {
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
	return minObservedAt, maxObservedAt
}
