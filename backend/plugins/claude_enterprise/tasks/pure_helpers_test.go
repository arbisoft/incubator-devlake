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

package tasks

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

// TestFirstIntHandlesAllNumericRepresentations covers every branch of
// firstInt's type switch, not just the float64 shape json.Unmarshal happens
// to produce for plain numbers.
func TestFirstIntHandlesAllNumericRepresentations(t *testing.T) {
	require.Equal(t, 5, firstInt(map[string]interface{}{"a": float64(5)}, "a"))
	require.Equal(t, 6, firstInt(map[string]interface{}{"a": int(6)}, "a"))
	require.Equal(t, 7, firstInt(map[string]interface{}{"a": json.Number("7")}, "a"))
	require.Equal(t, 0, firstInt(map[string]interface{}{"a": json.Number("not-a-number")}, "a"))
	require.Equal(t, 8, firstInt(map[string]interface{}{"a": "8"}, "a"))
	require.Equal(t, 0, firstInt(map[string]interface{}{"a": "not-a-number"}, "a"))
	require.Equal(t, 0, firstInt(map[string]interface{}{}, "missing"))
}

// TestFirstInt64HandlesAllNumericRepresentations mirrors
// TestFirstIntHandlesAllNumericRepresentations for firstInt64, which also
// has a dedicated int64 case.
func TestFirstInt64HandlesAllNumericRepresentations(t *testing.T) {
	require.Equal(t, int64(5), firstInt64(map[string]interface{}{"a": float64(5)}, "a"))
	require.Equal(t, int64(6), firstInt64(map[string]interface{}{"a": int(6)}, "a"))
	require.Equal(t, int64(9), firstInt64(map[string]interface{}{"a": int64(9)}, "a"))
	require.Equal(t, int64(7), firstInt64(map[string]interface{}{"a": json.Number("7")}, "a"))
	require.Equal(t, int64(0), firstInt64(map[string]interface{}{"a": json.Number("not-a-number")}, "a"))
	require.Equal(t, int64(8), firstInt64(map[string]interface{}{"a": "8"}, "a"))
	require.Equal(t, int64(0), firstInt64(map[string]interface{}{"a": "not-a-number"}, "a"))
	require.Equal(t, int64(0), firstInt64(map[string]interface{}{}, "missing"))
}

// TestFirstDecimalStringHandlesAllNumericRepresentations covers every branch
// of firstDecimalString's type switch, including the float64/int/int64 shapes
// a live Analytics API response could plausibly produce even though
// documented amounts are decimal strings (Section 9).
func TestFirstDecimalStringHandlesAllNumericRepresentations(t *testing.T) {
	require.Equal(t, "1.5000", firstDecimalString(map[string]interface{}{"a": "1.5000"}, "a"))
	require.Equal(t, "2.5", firstDecimalString(map[string]interface{}{"a": json.Number("2.5")}, "a"))
	require.Equal(t, "3", firstDecimalString(map[string]interface{}{"a": float64(3)}, "a"))
	require.Equal(t, "4", firstDecimalString(map[string]interface{}{"a": int(4)}, "a"))
	require.Equal(t, "5", firstDecimalString(map[string]interface{}{"a": int64(5)}, "a"))
	require.Equal(t, "", firstDecimalString(map[string]interface{}{}, "missing"))
}

// TestIntValueHandlesAllNumericRepresentations covers intValue's type
// switch (used by BuildUserActivity for session/line/commit/PR counts).
func TestIntValueHandlesAllNumericRepresentations(t *testing.T) {
	require.Equal(t, 5, intValue(map[string]interface{}{"a": float64(5)}, "a"))
	require.Equal(t, 6, intValue(map[string]interface{}{"a": int(6)}, "a"))
	require.Equal(t, 9, intValue(map[string]interface{}{"a": int64(9)}, "a"))
	require.Equal(t, 7, intValue(map[string]interface{}{"a": json.Number("7")}, "a"))
	require.Equal(t, 0, intValue(map[string]interface{}{"a": json.Number("not-a-number")}, "a"))
	require.Equal(t, 8, intValue(map[string]interface{}{"a": "8"}, "a"))
	require.Equal(t, 0, intValue(map[string]interface{}{"a": "not-a-number"}, "a"))
	require.Equal(t, 0, intValue(map[string]interface{}{}, "missing"))
}

func TestNormalizeAnalyticsTimestampHandlesAllInputShapes(t *testing.T) {
	require.Equal(t, "", normalizeAnalyticsTimestamp(""))
	require.Equal(t, "2026-01-05T00:00:00Z", normalizeAnalyticsTimestamp("2026-01-05T00:00:00Z"))
	require.Equal(t, "2026-01-05T00:00:00Z", normalizeAnalyticsTimestamp("2026-01-05"))
	require.Equal(t, "not-a-date", normalizeAnalyticsTimestamp("not-a-date"))
}

// TestParseAnalyticsResponseHandlesAllEnvelopeShapes covers parseAnalyticsResponse
// branches the fixture-driven tests in analytics_tasks_test.go do not reach:
// an empty body, the "items"/"results" envelope keys, an unrecognized object
// falling back to a single wrapped item, and a genuinely unparseable body.
func TestParseAnalyticsResponseHandlesAllEnvelopeShapes(t *testing.T) {
	empty, err := parseAnalyticsResponse(&http.Response{Body: io.NopCloser(bytesReader([]byte{}))})
	require.NoError(t, err)
	require.Nil(t, empty)

	items, err := parseAnalyticsResponse(&http.Response{Body: io.NopCloser(bytesReader([]byte(`{"items":[{"a":1}]}`)))})
	require.NoError(t, err)
	require.Len(t, items, 1)

	results, err := parseAnalyticsResponse(&http.Response{Body: io.NopCloser(bytesReader([]byte(`{"results":[{"a":1}]}`)))})
	require.NoError(t, err)
	require.Len(t, results, 1)

	fallback, err := parseAnalyticsResponse(&http.Response{Body: io.NopCloser(bytesReader([]byte(`{"unrecognized":true}`)))})
	require.NoError(t, err)
	require.Len(t, fallback, 1)

	_, err = parseAnalyticsResponse(&http.Response{Body: io.NopCloser(bytesReader([]byte(`not json`)))})
	require.Error(t, err)
}

func TestBuildUsageReportRequiresStartingAt(t *testing.T) {
	_, err := BuildUsageReport([]byte(`{"ending_at":"2026-01-06T00:00:00Z"}`), analyticsRawParams{Endpoint: userUsageReportEndpoint.Name})
	require.Error(t, err)
}

func TestBuildCostReportRequiresStartingAt(t *testing.T) {
	_, err := BuildCostReport([]byte(`{"ending_at":"2026-01-06T00:00:00Z"}`), analyticsRawParams{Endpoint: userCostReportEndpoint.Name})
	require.Error(t, err)
}
