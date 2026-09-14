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
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models/common"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	metricsv1 "go.opentelemetry.io/proto/otlp/metrics/v1"
	resourcev1 "go.opentelemetry.io/proto/otlp/resource/v1"
)

func TestPrepareUpdatesUsesTypedIdentityAndSeparateFactGrains(t *testing.T) {
	database := dalmocks.NewDal(t)
	organizationID := "0d0e7a3b-52f1-4c7e-9a51-3f6f2f7c1b9e"
	observedAt := time.Date(2026, 9, 14, 10, 15, 0, 0, time.UTC)
	database.EXPECT().All(mock.AnythingOfType("*[]*models.OtelConnection"), mock.Anything).Run(
		func(connections interface{}, _ ...dal.Clause) {
			*connections.(*[]*models.OtelConnection) = []*models.OtelConnection{{
				TeamSlug:       "platform",
				OrganizationId: &organizationID,
				Model:          common.Model{CreatedAt: observedAt.Add(-time.Hour)},
			}}
		},
	).Return(nil).Times(3)

	converter := newRawMetricConverter(database)
	request := newConverterRequest(observedAt, organizationID)
	updates, err := converter.prepareUpdates(request)
	if err != nil {
		t.Fatalf("prepareUpdates() error = %v", err)
	}
	if len(updates) != 3 {
		t.Fatalf("prepareUpdates() updates = %d, want 3", len(updates))
	}
	for _, update := range updates {
		if update.identity.key != "acct:user_012pKEfgvvBR2CYw6KjnyAW2" {
			t.Fatalf("identity key = %q", update.identity.key)
		}
		if update.hour != observedAt.Truncate(time.Hour) {
			t.Fatalf("hour = %s, want UTC hour %s", update.hour, observedAt.Truncate(time.Hour))
		}
	}
	if updates[1].model != "claude-sonnet-4-20250514" || updates[1].query != "main" {
		t.Fatalf("model update dimensions = %#v", updates[1])
	}
	if updates[2].tool != "Edit" || updates[2].decision != "accept" || updates[2].language != "go" {
		t.Fatalf("tool update dimensions = %#v", updates[2])
	}
}

func TestPrepareUpdatesRejectsMalformedSupportedMetric(t *testing.T) {
	database := dalmocks.NewDal(t)
	observedAt := time.Now().UTC()
	database.EXPECT().All(mock.AnythingOfType("*[]*models.OtelConnection"), mock.Anything).Run(
		func(connections interface{}, _ ...dal.Clause) {
			*connections.(*[]*models.OtelConnection) = []*models.OtelConnection{{
				TeamSlug: "platform",
				Model:    common.Model{CreatedAt: observedAt.Add(-time.Hour)},
			}}
		},
	).Return(nil)
	converter := newRawMetricConverter(database)
	request := newOtelMetricsRequest("platform", "")
	request.ResourceMetrics[0].ScopeMetrics = []*metricsv1.ScopeMetrics{{Metrics: []*metricsv1.Metric{{
		Name: metricTokenUsage,
		Data: &metricsv1.Metric_Sum{Sum: &metricsv1.Sum{DataPoints: []*metricsv1.NumberDataPoint{{
			TimeUnixNano: uint64(observedAt.UnixNano()),
			Attributes:   []*commonv1.KeyValue{stringAttribute("user.account_id", "user_012pKEfgvvBR2CYw6KjnyAW2")},
			Value:        &metricsv1.NumberDataPoint_AsInt{AsInt: 1},
		}}}},
	}}}}
	_, err := converter.prepareUpdates(request)
	if err == nil {
		t.Fatal("prepareUpdates() error = nil, want malformed supported metric rejection")
	}
	if conversionErr, ok := err.(*conversionError); !ok || !conversionErr.permanent || conversionErr.code != "invalid_dimension" {
		t.Fatalf("prepareUpdates() error = %v, want invalid-dimension permanent conversion error", err)
	}
}

func TestCounterDeltaRejectsOutOfOrderCumulativeSamples(t *testing.T) {
	transaction := dalmocks.NewTransaction(t)
	converter := newRawMetricConverter(nil)
	lastValue := "10"
	transaction.EXPECT().First(mock.AnythingOfType("*models.OtelMetricSeriesState"), mock.Anything).Run(
		func(state interface{}, _ ...dal.Clause) {
			stored := state.(*models.OtelMetricSeriesState)
			stored.LastTimeUnixNano = 20
			stored.LastNumberValue = &lastValue
		},
	).Return(nil)
	transaction.EXPECT().IsErrorNotFound(nil).Return(false)

	_, err := converter.counterDelta(transaction, factUpdate{
		metric:      metricSessionCount,
		value:       metricNumber{integer: true, int64: 12, decimal: "12"},
		temporality: metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_CUMULATIVE,
		timeNanos:   20,
		seriesHash:  make([]byte, 32),
	})
	if err == nil {
		t.Fatal("counterDelta() error = nil, want out-of-order rejection")
	}
	conversionErr, ok := err.(*conversionError)
	if !ok || conversionErr.code != "out_of_order_cumulative" || !conversionErr.permanent {
		t.Fatalf("counterDelta() error = %#v", err)
	}
}

func TestDailyTargetsAggregateTeamsIntoOneOrganizationCandidate(t *testing.T) {
	organizationID := "0d0e7a3b-52f1-4c7e-9a51-3f6f2f7c1b9e"
	accountID := "user_012pKEfgvvBR2CYw6KjnyAW2"
	hour := time.Date(2026, 9, 14, 10, 0, 0, 0, time.UTC)
	targets := dailyTargets([]factUpdate{
		{connection: &models.OtelConnection{OrganizationId: &organizationID, TeamSlug: "backend"}, identity: developerIdentity{key: "acct:" + accountID, accountID: &accountID}, hour: hour},
		{connection: &models.OtelConnection{OrganizationId: &organizationID, TeamSlug: "frontend"}, identity: developerIdentity{key: "acct:" + accountID, accountID: &accountID}, hour: hour.Add(time.Hour)},
	})
	if len(targets) != 1 {
		t.Fatalf("daily targets = %d, want one organization-wide candidate", len(targets))
	}
	if targets[0].workspaceKey != organizationID || targets[0].userKey != "acct:"+accountID {
		t.Fatalf("daily target = %#v", targets[0])
	}
}

func newConverterRequest(observedAt time.Time, organizationID string) *collectormetrics.ExportMetricsServiceRequest {
	attributes := []*commonv1.KeyValue{
		stringAttribute(devlakeTeamAttribute, "platform"),
		stringAttribute(organizationIDAttribute, organizationID),
	}
	pointAttributes := []*commonv1.KeyValue{
		stringAttribute("user.account_id", "user_012pKEfgvvBR2CYw6KjnyAW2"),
		stringAttribute("user.account_uuid", "aaaa1111-1111-4111-8111-111111111111"),
		stringAttribute("user.email", "Developer@example.com"),
		stringAttribute("model", "claude-sonnet-4-20250514"),
		stringAttribute("query_source", "main"),
		stringAttribute("tool_name", "Edit"),
		stringAttribute("decision", "accept"),
		stringAttribute("language", "go"),
	}
	point := func(value int64, extra ...*commonv1.KeyValue) *metricsv1.NumberDataPoint {
		return &metricsv1.NumberDataPoint{Attributes: append(append([]*commonv1.KeyValue{}, pointAttributes...), extra...), TimeUnixNano: uint64(observedAt.UnixNano()), Value: &metricsv1.NumberDataPoint_AsInt{AsInt: value}}
	}
	return &collectormetrics.ExportMetricsServiceRequest{ResourceMetrics: []*metricsv1.ResourceMetrics{{
		Resource: &resourcev1.Resource{Attributes: attributes},
		ScopeMetrics: []*metricsv1.ScopeMetrics{{Metrics: []*metricsv1.Metric{
			{Name: metricSessionCount, Data: &metricsv1.Metric_Sum{Sum: &metricsv1.Sum{AggregationTemporality: metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA, DataPoints: []*metricsv1.NumberDataPoint{point(1)}}}},
			{Name: metricTokenUsage, Data: &metricsv1.Metric_Sum{Sum: &metricsv1.Sum{AggregationTemporality: metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA, DataPoints: []*metricsv1.NumberDataPoint{point(10, stringAttribute("type", "input"))}}}},
			{Name: metricToolDecision, Data: &metricsv1.Metric_Sum{Sum: &metricsv1.Sum{AggregationTemporality: metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA, DataPoints: []*metricsv1.NumberDataPoint{point(2)}}}},
		}}},
	}}}
}
