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
	"math/big"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

func TestSessionIDFromAttributesPrefersRecordAndDropsOversizedID(t *testing.T) {
	resource := []*commonv1.KeyValue{stringAttribute(sessionIDAttribute, "resource-session")}
	record := []*commonv1.KeyValue{stringAttribute(sessionIDAttribute, "record-session")}

	if got := sessionIDFromAttributes(resource, record); got != "record-session" {
		t.Fatalf("sessionIDFromAttributes() = %q, want the record's session", got)
	}
	if got := sessionIDFromAttributes(resource, nil); got != "resource-session" {
		t.Fatalf("sessionIDFromAttributes(no record session) = %q, want the resource's session", got)
	}
	if got := sessionIDFromAttributes(nil, nil); got != "" {
		t.Fatalf("sessionIDFromAttributes(no attributes) = %q, want empty", got)
	}
	oversized := []*commonv1.KeyValue{stringAttribute(sessionIDAttribute, strings.Repeat("s", maxSessionIDLength+1))}
	if got := sessionIDFromAttributes(nil, oversized); got != "" {
		t.Fatalf("oversized session id = %q, want dropped", got)
	}
}

// Generated settings keep OTEL_METRICS_INCLUDE_SESSION_ID on for prompt events, so metrics
// still arrive with session.id. It must not cause datapoints to be skipped.
func TestRealShapedExportWithSessionIDKeepsEveryDatapoint(t *testing.T) {
	payload, err := os.ReadFile("testdata/claude_code_delta_metrics.json")
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	request := &collectormetrics.ExportMetricsServiceRequest{}
	if err := protojson.Unmarshal(payload, request); err != nil {
		t.Fatalf("protojson.Unmarshal() error = %v", err)
	}
	addSumAttributes(request, stringAttribute(sessionIDAttribute, "5f0c4f43-6f7e-4b55-9d4e-2f1f0a8b2c11"))
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})

	prepared, err := newRawMetricConverter(database, nil).prepareUpdates(request)
	if err != nil {
		t.Fatalf("prepareUpdates() error = %v", err)
	}
	if len(prepared.updates) == 0 || prepared.skippedCount != 0 {
		t.Fatalf("prepareUpdates() updates=%d skipped=%d", len(prepared.updates), prepared.skippedCount)
	}
}

// Replay aggregates hourly facts without a session dimension, so two sessions in one hour
// collapse into one aggregate holding their total.
func TestReplaySumsHourlyFactsAcrossSessions(t *testing.T) {
	observedAt := time.Date(2026, 10, 8, 10, 15, 0, 0, time.UTC)
	marshalBatch := func(request *collectormetrics.ExportMetricsServiceRequest) *models.OtelMetricBatch {
		payload, err := proto.Marshal(request)
		if err != nil {
			t.Fatalf("proto.Marshal() error = %v", err)
		}
		return &models.OtelMetricBatch{PayloadProto: payload, PayloadSchemaVersion: otelPayloadSchemaVersion, Status: models.OtelMetricBatchStatusProcessed}
	}
	aggregates := make(map[string]*hourlyAggregate)
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform", Model: common.Model{ID: 7, CreatedAt: observedAt.Add(-time.Hour)}}})
	converter := newRawMetricConverter(database, nil)
	dayStart := observedAt.Truncate(24 * time.Hour)
	for _, request := range []*collectormetrics.ExportMetricsServiceRequest{newSessionRequest(observedAt, "session-a"), newSessionRequest(observedAt, "session-b")} {
		processed, skippedErr, err := converter.replayBatch(marshalBatch(request), dayStart, dayStart.Add(24*time.Hour), aggregates)
		if err != nil || skippedErr != nil || !processed {
			t.Fatalf("replayBatch() = %t, %v, %v", processed, skippedErr, err)
		}
	}

	inputTokens := make([]string, 0)
	for _, aggregate := range aggregates {
		if aggregate.update.fact == hourlyModelUsageFact && aggregate.update.column == "input_tokens" {
			inputTokens = append(inputTokens, aggregate.value.RatString())
		}
	}
	if len(inputTokens) != 1 || inputTokens[0] != new(big.Rat).SetInt64(20).RatString() {
		t.Fatalf("replayed input token aggregates = %v, want one aggregate of 20", inputTokens)
	}
}

// newSessionRequest is newConverterRequest with session.id on every datapoint.
func newSessionRequest(observedAt time.Time, sessionID string) *collectormetrics.ExportMetricsServiceRequest {
	request := newConverterRequest(observedAt, testOrganizationID)
	addSumAttributes(request, stringAttribute(sessionIDAttribute, sessionID))
	return request
}

// addSumAttributes appends attributes to every sum datapoint; every supported metric is a sum.
func addSumAttributes(request *collectormetrics.ExportMetricsServiceRequest, attributes ...*commonv1.KeyValue) {
	for _, resourceMetrics := range request.GetResourceMetrics() {
		for _, scopeMetrics := range resourceMetrics.GetScopeMetrics() {
			for _, metric := range scopeMetrics.GetMetrics() {
				for _, datapoint := range metric.GetSum().GetDataPoints() {
					datapoint.Attributes = append(datapoint.Attributes, attributes...)
				}
			}
		}
	}
}
