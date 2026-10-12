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
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

func TestSessionFromAttributesPrefersDatapointAndDropsOversizedID(t *testing.T) {
	resource := []*commonv1.KeyValue{
		stringAttribute(sessionIDAttribute, "resource-session"),
		stringAttribute(terminalTypeAttribute, "iTerm.app"),
		stringAttribute(serviceVersionAttribute, "2.1.0"),
		stringAttribute(osTypeAttribute, "darwin"),
	}
	point := []*commonv1.KeyValue{stringAttribute(sessionIDAttribute, "point-session"), stringAttribute(terminalTypeAttribute, "vscode")}

	got := sessionFromAttributes(resource, point)
	want := sessionAttributes{id: "point-session", terminalType: "vscode", appVersion: "2.1.0", osType: "darwin"}
	if got != want {
		t.Fatalf("sessionFromAttributes() = %#v, want %#v", got, want)
	}
	if got := sessionFromAttributes(nil, nil); got != (sessionAttributes{}) {
		t.Fatalf("sessionFromAttributes(no attributes) = %#v, want empty", got)
	}
	oversized := []*commonv1.KeyValue{stringAttribute(sessionIDAttribute, strings.Repeat("s", maxSessionIDLength+1))}
	if got := sessionFromAttributes(nil, oversized); got.id != "" {
		t.Fatalf("oversized session id = %q, want dropped", got.id)
	}
}

func TestPrepareUpdatesCarriesSessionDimensions(t *testing.T) {
	observedAt := time.Date(2026, 10, 9, 10, 15, 0, 0, time.UTC)
	request := newSessionRequest(observedAt, "session-a")
	request.ResourceMetrics[0].Resource.Attributes = append(request.ResourceMetrics[0].Resource.Attributes,
		stringAttribute(serviceVersionAttribute, "2.1.0"), stringAttribute(osTypeAttribute, "linux"))
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform", Model: common.Model{ID: 7, CreatedAt: observedAt.Add(-time.Hour)}}})

	prepared, err := newRawMetricConverter(database, nil).prepareUpdates(request)
	if err != nil {
		t.Fatalf("prepareUpdates() error = %v", err)
	}
	want := sessionAttributes{id: "session-a", terminalType: "vscode", appVersion: "2.1.0", osType: "linux"}
	for _, update := range prepared.updates {
		if update.session != want {
			t.Fatalf("%s session = %#v, want %#v", update.metric, update.session, want)
		}
	}
}

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
	for _, update := range prepared.updates {
		if update.session.id != "5f0c4f43-6f7e-4b55-9d4e-2f1f0a8b2c11" || update.session.appVersion == "" {
			t.Fatalf("%s session = %#v, want id and app version", update.metric, update.session)
		}
	}
}

func TestUpsertSessionFactSkipsDatapointsWithoutSession(t *testing.T) {
	// A nil transaction proves no statement is issued.
	if err := upsertSessionFact(nil, factUpdate{column: "lines_added"}, metricNumber{value: big.NewRat(1, 1)}, time.Now()); err != nil {
		t.Fatalf("upsertSessionFact() error = %v", err)
	}
}

func TestUpsertSessionFactAddsMappedColumnToSessionRow(t *testing.T) {
	observedAt := time.Date(2026, 10, 9, 10, 15, 0, 0, time.UTC)
	organizationID := testOrganizationID
	update := factUpdate{
		connection:     &models.OtelConnection{TeamSlug: "platform", OrganizationId: &organizationID, Model: common.Model{ID: 7}},
		organizationID: testOrganizationID,
		identity:       developerIdentity{key: "acct:user_1"},
		hour:           observedAt.Truncate(time.Hour),
		observedAt:     observedAt,
		column:         "input_tokens",
		session:        sessionAttributes{id: "session-a", terminalType: "vscode", appVersion: "2.1.0", osType: "linux"},
	}
	transaction := dalmocks.NewTransaction(t)
	query := mock.MatchedBy(func(query string) bool {
		return strings.HasPrefix(query, "INSERT INTO "+models.OtelSessionHourTable+" (") &&
			strings.Contains(query, "input_tokens = "+models.OtelSessionHourTable+".input_tokens + incoming.input_tokens") &&
			strings.Contains(query, "terminal_type = IF(incoming.terminal_type = ''")
	})
	arguments := []interface{}{query, uint64(7), "platform", testOrganizationID, "acct:user_1",
		mock.Anything, mock.Anything, mock.Anything, "session-a", update.hour, "vscode", "2.1.0", "linux", "10", observedAt, observedAt}
	transaction.On("Exec", arguments...).Return(nil).Once()

	if err := upsertSessionFact(transaction, update, metricNumber{value: big.NewRat(10, 1)}, observedAt); err != nil {
		t.Fatalf("upsertSessionFact() error = %v", err)
	}
}

func TestReplayKeepsSessionsSeparateAndHourlyTotalsUnchanged(t *testing.T) {
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

	var total big.Rat
	sessions := make(map[string]string)
	for _, aggregate := range aggregates {
		if aggregate.update.fact == hourlyModelUsageFact && aggregate.update.column == "input_tokens" {
			total.Add(&total, aggregate.value)
			sessions[aggregate.update.session.id] = aggregate.value.RatString()
		}
	}
	if total.RatString() != "20" {
		t.Fatalf("replayed input token total = %s, want 20", total.RatString())
	}
	if len(sessions) != 2 || sessions["session-a"] != "10" || sessions["session-b"] != "10" {
		t.Fatalf("replayed input tokens per session = %v, want 10 each for session-a and session-b", sessions)
	}
}

// newSessionRequest is newConverterRequest with session.id and terminal.type on every datapoint.
func newSessionRequest(observedAt time.Time, sessionID string) *collectormetrics.ExportMetricsServiceRequest {
	request := newConverterRequest(observedAt, testOrganizationID)
	addSumAttributes(request, stringAttribute(sessionIDAttribute, sessionID), stringAttribute(terminalTypeAttribute, "vscode"))
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
