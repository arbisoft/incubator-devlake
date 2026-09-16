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
	"strings"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
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

// TestCurrentSchemaVersionIsDecodable guards decodableSchemaVersions being keyed by
// literal rather than by otelPayloadSchemaVersion: a version bump that forgets to add the
// new literal here would otherwise make the current write-time schema version silently
// undecodable, with no compiler error.
func TestCurrentSchemaVersionIsDecodable(t *testing.T) {
	if _, ok := decodableSchemaVersions[otelPayloadSchemaVersion]; !ok {
		t.Fatalf("payload schema version %d must be listed in decodableSchemaVersions", otelPayloadSchemaVersion)
	}
}

// withMockDal points the package-level db at a mock for the duration of the test and
// restores the previous value afterward; observability.go's queries read the package
// global rather than taking a db parameter.
func withMockDal(t *testing.T) *dalmocks.Dal {
	t.Helper()
	original := db
	mockDal := dalmocks.NewDal(t)
	db = mockDal
	t.Cleanup(func() { db = original })
	return mockDal
}

func TestOtelConverterLeaseStatusActive(t *testing.T) {
	now := time.Date(2026, 9, 16, 12, 0, 0, 0, time.UTC)
	testCases := []struct {
		name       string
		leaseUntil time.Time
		want       bool
	}{
		{name: "future lease is active", leaseUntil: now.Add(30 * time.Second), want: true},
		{name: "expired lease is not active", leaseUntil: now.Add(-30 * time.Second), want: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			mockDal := withMockDal(t)
			mockDal.EXPECT().First(mock.AnythingOfType("*models.OtelConverterLease"), mock.Anything).Run(
				func(dst interface{}, _ ...dal.Clause) {
					lease := dst.(*models.OtelConverterLease)
					*lease = models.OtelConverterLease{LeaseUntil: testCase.leaseUntil, UpdatedAt: now}
				},
			).Return(nil)

			status, err := otelConverterLeaseStatus(now)
			if err != nil {
				t.Fatalf("otelConverterLeaseStatus() error = %v", err)
			}
			if status.Active != testCase.want {
				t.Fatalf("otelConverterLeaseStatus().Active = %t, want %t (leaseUntil=%s, now=%s)",
					status.Active, testCase.want, testCase.leaseUntil, now)
			}
		})
	}
}

func TestOtelRecentPermanentErrorsToleratesMissingProcessedAt(t *testing.T) {
	now := time.Date(2026, 9, 16, 12, 0, 0, 0, time.UTC)
	mockDal := withMockDal(t)
	mockDal.EXPECT().Count(mock.Anything).Run(func(clauses ...dal.Clause) {
		assertWhereClauseTolerantOfMissingProcessedAt(t, clauses)
	}).Return(int64(1), nil)
	mockDal.EXPECT().All(mock.AnythingOfType("*[]service.permanentErrorReason"), mock.Anything).Run(
		func(_ interface{}, clauses ...dal.Clause) {
			assertWhereClauseTolerantOfMissingProcessedAt(t, clauses)
		},
	).Return(nil)

	count, _, err := otelRecentPermanentErrors(now)
	if err != nil {
		t.Fatalf("otelRecentPermanentErrors() error = %v", err)
	}
	if count != 1 {
		t.Fatalf("otelRecentPermanentErrors() count = %d, want 1", count)
	}
}

// assertWhereClauseTolerantOfMissingProcessedAt pins the COALESCE guard against a
// "simplification" back to bare processed_at >= ?. It matches on SQL text, so it verifies
// intent rather than behavior: the semantics (a NULL processed_at row with a recent
// received_at is counted) are only covered by integration testing against a real database.
func assertWhereClauseTolerantOfMissingProcessedAt(t *testing.T, clauses []dal.Clause) {
	t.Helper()
	for _, clause := range clauses {
		if clause.Type != dal.WhereClause {
			continue
		}
		where, ok := clause.Data.(dal.DalClause)
		if ok && strings.Contains(where.Expr, "COALESCE(processed_at, received_at)") {
			return
		}
	}
	t.Fatalf("query clauses = %#v; want a WHERE clause tolerant of NULL processed_at via COALESCE", clauses)
}
