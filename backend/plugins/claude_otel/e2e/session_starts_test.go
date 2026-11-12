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

package e2e

import (
	"testing"
	"time"

	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/require"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	metricsv1 "go.opentelemetry.io/proto/otlp/metrics/v1"
)

// cumulativeSessionRequest is one export of a cumulative session.count series whose start time stays fixed.
func cumulativeSessionRequest(who actor, seriesStart, at time.Time, total int64) *collectormetrics.ExportMetricsServiceRequest {
	resource := who.resource(at, 2)
	var attributes []*commonv1.KeyValue
	for _, metric := range resource.ScopeMetrics[0].Metrics {
		if metric.Name == "claude_code.session.count" {
			for _, attribute := range metric.GetSum().DataPoints[0].Attributes {
				if attribute.Key != "session.id" && attribute.Key != "start_type" {
					attributes = append(attributes, attribute)
				}
			}
		}
	}
	attributes = append(attributes, strAttr("session.id", "sess-cumulative"), strAttr("start_type", "fresh"))
	resource.ScopeMetrics[0].Metrics = []*metricsv1.Metric{{Name: "claude_code.session.count", Data: &metricsv1.Metric_Sum{Sum: &metricsv1.Sum{
		AggregationTemporality: metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_CUMULATIVE,
		IsMonotonic:            true,
		DataPoints: []*metricsv1.NumberDataPoint{{
			Attributes:        attributes,
			StartTimeUnixNano: uint64(seriesStart.UnixNano()),
			TimeUnixNano:      uint64(at.UnixNano()),
			Value:             &metricsv1.NumberDataPoint_AsInt{AsInt: total},
		}},
	}}}}
	return &collectormetrics.ExportMetricsServiceRequest{ResourceMetrics: []*metricsv1.ResourceMetrics{resource}}
}

func TestCumulativeSessionCountWritesOneDeltaToBothFacts(t *testing.T) {
	w := newWorld(t)
	connection := w.connection(a1.team, a1.org, w.day(-5))
	h := w.day(-1).Add(9 * time.Hour)

	for _, step := range []struct {
		at    time.Time
		total int64
	}{
		{h.Add(5 * time.Minute), 1},
		{h.Add(30 * time.Minute), 3},
		{h.Add(time.Hour + 10*time.Minute), 3},
	} {
		w.insertMetricRequest(cumulativeSessionRequest(a1, h, step.at, step.total))
		w.drainNow()
	}

	var sessions int64
	for _, row := range snapshot[models.OtelHourlyActivity](w, hourlyActivityOrder, "connection_id = ?", connection.ID) {
		sessions += row.SessionCount
	}
	require.Equal(t, int64(3), sessions)
	starts := snapshot[models.OtelHourlySessionStart](w, hourlySessionStartOrder, "connection_id = ?", connection.ID)
	require.Len(t, starts, 1)
	require.True(t, h.Equal(starts[0].HourStart), "session start hour = %s, want %s", starts[0].HourStart, h)
	require.Equal(t, int64(3), starts[0].StartCount)
	require.Zero(t, w.count(&models.OtelHourlySessionStart{}, "connection_id = ? AND hour_start = ?", connection.ID, h.Add(time.Hour)))
}
