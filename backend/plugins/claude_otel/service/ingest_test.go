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

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	configmocks "github.com/apache/incubator-devlake/mocks/core/config"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	metricsv1 "go.opentelemetry.io/proto/otlp/metrics/v1"
	resourcev1 "go.opentelemetry.io/proto/otlp/resource/v1"
	"google.golang.org/protobuf/proto"
)

func TestRawIngestRejectsUnauthenticatedAndMalformedRequests(t *testing.T) {
	validPayload := marshalOtelMetricsRequest(t, newOtelMetricsRequest("platform", ""))

	testCases := []struct {
		name        string
		contentType string
		token       string
		payload     []byte
		status      int
	}{
		{name: "missing token", contentType: otlpProtobufContentType, payload: validPayload, status: http.StatusUnauthorized},
		{name: "invalid token", contentType: otlpProtobufContentType, token: "incorrect", payload: validPayload, status: http.StatusForbidden},
		{name: "unsupported content type", contentType: "application/json", token: "collector-token", payload: validPayload, status: http.StatusUnsupportedMediaType},
		{name: "malformed payload", contentType: otlpProtobufContentType, token: "collector-token", payload: []byte("not protobuf"), status: http.StatusBadRequest},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			service, _ := newRawIngestService(t)
			request := httptest.NewRequest(http.MethodPost, "/plugins/claude_otel/otlp/v1/metrics", bytes.NewReader(testCase.payload))
			request.Header.Set("Content-Type", testCase.contentType)
			request.Header.Set(claudeOtelIngestTokenHeader, testCase.token)

			_, err := service.Ingest(request)
			if err == nil {
				t.Fatal("Ingest() error = nil")
			}
			if actual := err.GetType().GetHttpCode(); actual != testCase.status {
				t.Fatalf("Ingest() status = %d, want %d", actual, testCase.status)
			}
		})
	}
}

func TestRawIngestRejectsOversizedPayload(t *testing.T) {
	service, _ := newRawIngestService(t)
	request := httptest.NewRequest(
		http.MethodPost,
		"/plugins/claude_otel/otlp/v1/metrics",
		bytes.NewReader(bytes.Repeat([]byte{0}, maxOtelIngestBodyBytes+1)),
	)
	request.Header.Set("Content-Type", otlpProtobufContentType)
	request.Header.Set(claudeOtelIngestTokenHeader, "collector-token")

	_, err := service.Ingest(request)
	if err == nil {
		t.Fatal("Ingest() error = nil")
	}
	if status := err.GetType().GetHttpCode(); status != http.StatusRequestEntityTooLarge {
		t.Fatalf("Ingest() status = %d, want %d", status, http.StatusRequestEntityTooLarge)
	}
}

func TestRawIngestPersistsOneCanonicalBatch(t *testing.T) {
	service, database := newRawIngestService(t)
	transaction := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(transaction)
	transaction.EXPECT().Create(mock.AnythingOfType("*models.OtelMetricBatch")).Run(func(batch interface{}, _ ...dal.Clause) {
		rawBatch := batch.(*models.OtelMetricBatch)
		rawBatch.ID = 42
		if rawBatch.MinObservedAt == nil || rawBatch.MaxObservedAt == nil {
			t.Fatal("raw batch did not retain observed-time bounds")
		}
	}).Return(nil)
	transaction.EXPECT().Commit().Return(nil)

	payload := marshalOtelMetricsRequest(t, newOtelMetricsRequestWithDatapoint("platform", "", 1_726_272_000_000_000_000))
	request := httptest.NewRequest(http.MethodPost, "/plugins/claude_otel/otlp/v1/metrics", bytes.NewReader(payload))
	request.Header.Set("Content-Type", otlpProtobufContentType)
	request.Header.Set(claudeOtelIngestTokenHeader, "collector-token")

	result, err := service.Ingest(request)
	if err != nil {
		t.Fatalf("Ingest() error = %v", err)
	}
	if result.BatchID != 42 || result.Duplicate {
		t.Fatalf("Ingest() result = %#v, want batch 42 and non-duplicate", result)
	}
}

func TestRawIngestReturnsRetryableErrorWhenRawStorageFails(t *testing.T) {
	service, database := newRawIngestService(t)
	transaction := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(transaction)
	transaction.EXPECT().Create(mock.AnythingOfType("*models.OtelMetricBatch")).Return(errors.Default.New("database unavailable"))
	transaction.EXPECT().Rollback().Return(nil)
	database.EXPECT().IsDuplicationError(mock.Anything).Return(false)

	payload := marshalOtelMetricsRequest(t, newOtelMetricsRequest("platform", ""))
	request := httptest.NewRequest(http.MethodPost, "/plugins/claude_otel/otlp/v1/metrics", bytes.NewReader(payload))
	request.Header.Set("Content-Type", otlpProtobufContentType)
	request.Header.Set(claudeOtelIngestTokenHeader, "collector-token")

	_, err := service.Ingest(request)
	if err == nil {
		t.Fatal("Ingest() error = nil")
	}
	if status := err.GetType().GetHttpCode(); status != http.StatusServiceUnavailable {
		t.Fatalf("Ingest() status = %d, want %d", status, http.StatusServiceUnavailable)
	}
}

func TestRawIngestAcknowledgesExactDuplicate(t *testing.T) {
	service, database := newRawIngestService(t)
	transaction := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(transaction)
	transaction.EXPECT().Create(mock.AnythingOfType("*models.OtelMetricBatch")).Return(errors.Default.New("duplicate key"))
	transaction.EXPECT().Rollback().Return(nil)
	database.EXPECT().IsDuplicationError(mock.Anything).Return(true)

	payload := marshalOtelMetricsRequest(t, newOtelMetricsRequest("platform", ""))
	request := httptest.NewRequest(http.MethodPost, "/plugins/claude_otel/otlp/v1/metrics", bytes.NewReader(payload))
	request.Header.Set("Content-Type", otlpProtobufContentType)
	request.Header.Set(claudeOtelIngestTokenHeader, "collector-token")

	result, err := service.Ingest(request)
	if err != nil {
		t.Fatalf("Ingest() error = %v", err)
	}
	if !result.Duplicate || result.BatchID != 0 {
		t.Fatalf("Ingest() result = %#v, want duplicate", result)
	}
}

func TestRawIngestRetainsOrganizationForEventTimeConversion(t *testing.T) {
	service, database := newRawIngestService(t)
	transaction := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(transaction)
	transaction.EXPECT().Create(mock.AnythingOfType("*models.OtelMetricBatch")).Return(nil)
	transaction.EXPECT().Commit().Return(nil)

	payload := marshalOtelMetricsRequest(t, newOtelMetricsRequest("platform", "11111111-1111-4111-8111-111111111111"))
	request := httptest.NewRequest(http.MethodPost, "/plugins/claude_otel/otlp/v1/metrics", bytes.NewReader(payload))
	request.Header.Set("Content-Type", otlpProtobufContentType)
	request.Header.Set(claudeOtelIngestTokenHeader, "collector-token")

	if _, err := service.Ingest(request); err != nil {
		t.Fatalf("Ingest() error = %v", err)
	}
}

func TestRawIngestRequiresConsistentDatapointAttribution(t *testing.T) {
	request := newOtelMetricsRequest("platform", "")
	points := request.ResourceMetrics[0].ScopeMetrics[0].Metrics[0].GetGauge().GetDataPoints()
	points = append(points, &metricsv1.NumberDataPoint{Attributes: []*commonv1.KeyValue{stringAttribute(devlakeTeamAttribute, "other")}})
	request.ResourceMetrics[0].ScopeMetrics[0].Metrics[0].GetGauge().DataPoints = points
	if _, _, err := validateOtelMetricsRequest(request); err != nil {
		t.Fatalf("validateOtelMetricsRequest() error = %v, want raw retention before conversion", err)
	}
}

func newRawIngestService(t *testing.T) (*RawIngestService, *dalmocks.Dal) {
	t.Helper()
	database := dalmocks.NewDal(t)
	configuration := configmocks.NewConfigReader(t)
	configuration.EXPECT().GetString(claudeOtelIngestTokenKey).Return("collector-token").Maybe()
	return NewRawIngestService(database, configuration, nil), database
}

func newOtelMetricsRequest(teamSlug string, organizationID string) *collectormetrics.ExportMetricsServiceRequest {
	attributes := []*commonv1.KeyValue{stringAttribute(devlakeTeamAttribute, teamSlug)}
	if organizationID != "" {
		attributes = append(attributes, stringAttribute(organizationIDAttribute, organizationID))
	}
	return &collectormetrics.ExportMetricsServiceRequest{
		ResourceMetrics: []*metricsv1.ResourceMetrics{{
			Resource: &resourcev1.Resource{},
			ScopeMetrics: []*metricsv1.ScopeMetrics{{Metrics: []*metricsv1.Metric{{
				Name: "claude_code.test",
				Data: &metricsv1.Metric_Gauge{Gauge: &metricsv1.Gauge{DataPoints: []*metricsv1.NumberDataPoint{{Attributes: attributes}}}},
			}}}},
		}},
	}
}

func newOtelMetricsRequestWithDatapoint(teamSlug string, organizationID string, timestamp uint64) *collectormetrics.ExportMetricsServiceRequest {
	request := newOtelMetricsRequest(teamSlug, organizationID)
	request.ResourceMetrics[0].ScopeMetrics[0].Metrics[0].GetGauge().DataPoints[0].TimeUnixNano = timestamp
	return request
}

func stringAttribute(key, value string) *commonv1.KeyValue {
	return &commonv1.KeyValue{
		Key:   key,
		Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: value}},
	}
}

func marshalOtelMetricsRequest(t *testing.T, request *collectormetrics.ExportMetricsServiceRequest) []byte {
	t.Helper()
	payload, err := proto.Marshal(request)
	if err != nil {
		t.Fatalf("proto.Marshal() error = %v", err)
	}
	return payload
}
