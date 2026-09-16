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
	"testing"

	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

func TestClassifyOtelIngestionHealth(t *testing.T) {
	testCases := []struct {
		name            string
		oldest          *OtelOldestNonterminalBatch
		permanentErrors int64
		wantState       string
	}{
		{name: "healthy", wantState: ingestionHealthHealthy},
		{
			name:      "degraded backlog",
			oldest:    &OtelOldestNonterminalBatch{AgeSeconds: int64(healthDegradedBacklogAge.Seconds())},
			wantState: ingestionHealthDegraded,
		},
		{
			name:      "unhealthy backlog",
			oldest:    &OtelOldestNonterminalBatch{AgeSeconds: int64(healthUnhealthyBacklogAge.Seconds())},
			wantState: ingestionHealthUnhealthy,
		},
		{name: "unhealthy permanent errors", permanentErrors: healthUnhealthyPermanentErrors, wantState: ingestionHealthUnhealthy},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			state, _ := classifyOtelIngestionHealth(testCase.oldest, testCase.permanentErrors)
			if state != testCase.wantState {
				t.Fatalf("classifyOtelIngestionHealth() = %q, want %q", state, testCase.wantState)
			}
		})
	}
}

func TestDecodeOtelMetricBatchPayload(t *testing.T) {
	payload := marshalOtelMetricsRequest(t, newOtelMetricsRequest("platform", ""))
	decoded, err := decodeOtelMetricBatchPayload(&models.OtelMetricBatch{
		PayloadProto:         payload,
		PayloadSchemaVersion: otelPayloadSchemaVersion,
	})
	if err != nil {
		t.Fatalf("decodeOtelMetricBatchPayload() error = %v", err)
	}
	if !bytes.Contains(decoded, []byte("resource_metrics")) {
		t.Fatalf("decodeOtelMetricBatchPayload() = %s, want OTLP ProtoJSON", decoded)
	}

	_, err = decodeOtelMetricBatchPayload(&models.OtelMetricBatch{PayloadSchemaVersion: otelPayloadSchemaVersion + 1})
	if err == nil {
		t.Fatal("decodeOtelMetricBatchPayload() error = nil for unsupported schema")
	}
}
