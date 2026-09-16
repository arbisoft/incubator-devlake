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
	stdErrors "errors"
	"fmt"
	"math/big"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	devlakeerrors "github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/common"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	metricsv1 "go.opentelemetry.io/proto/otlp/metrics/v1"
	resourcev1 "go.opentelemetry.io/proto/otlp/resource/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

const testOrganizationID = "0d0e7a3b-52f1-4c7e-9a51-3f6f2f7c1b9e"

func TestPrepareUpdatesUsesTypedIdentityAndSeparateFactGrains(t *testing.T) {
	observedAt := time.Date(2026, 9, 14, 10, 15, 0, 0, time.UTC)
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform", Model: common.Model{ID: 7, CreatedAt: observedAt.Add(-time.Hour)}}})

	prepared, err := newRawMetricConverter(database, nil).prepareUpdates(newConverterRequest(observedAt, testOrganizationID))
	if err != nil {
		t.Fatalf("prepareUpdates() error = %v", err)
	}
	updates := make(map[hourlyFact]factUpdate)
	for _, update := range prepared.updates {
		if update.identity.key != "acct:user_012pKEfgvvBR2CYw6KjnyAW2" || update.hour != observedAt.Truncate(time.Hour) {
			t.Fatalf("update identity/hour = %q/%s", update.identity.key, update.hour)
		}
		updates[update.fact] = update
	}
	if len(prepared.updates) != 3 || len(updates) != 3 {
		t.Fatalf("prepareUpdates() updates = %#v, want one update per fact grain", prepared.updates)
	}
	if model := updates[hourlyModelUsageFact]; model.model != "claude-sonnet-4-20250514" || model.query != "main" || model.column != "input_tokens" {
		t.Fatalf("model update = %#v", model)
	}
	if tool := updates[hourlyToolUsageFact]; tool.tool != "Edit" || tool.language != "go" || tool.column != "accepted_count" {
		t.Fatalf("tool update = %#v", tool)
	}
}

func TestClassifyConversionErrorUnwrapsPermanentErrors(t *testing.T) {
	err := fmt.Errorf("context: %w", permanentMetricError(errorInvalidOrganization, "invalid stored organization"))
	code, permanent, _ := classifyConversionError(err)
	if code != errorInvalidOrganization || !permanent {
		t.Fatalf("classifyConversionError() = %q, %t; want %q, true", code, permanent, errorInvalidOrganization)
	}
}

func TestCheckOrganizationBindingRejectsInvalidStoredOrganization(t *testing.T) {
	invalidOrganization := "not-a-uuid"
	preparer := &batchPreparer{pendingBindings: make(map[uint64]string)}
	err := preparer.checkOrganizationBinding(
		&models.OtelConnection{OrganizationId: &invalidOrganization},
		testOrganizationID,
		make(map[uint64]string),
	)
	code, permanent, _ := classifyConversionError(err)
	if code != errorInvalidOrganization || !permanent {
		t.Fatalf("checkOrganizationBinding() = %v; want permanent invalid organization", err)
	}
}

func TestDailyTargetsRetainFallbackIdentityWithoutAccountID(t *testing.T) {
	observedAt := time.Date(2026, 9, 14, 10, 15, 0, 0, time.UTC)
	targets := dailyTargets([]factUpdate{{
		organizationID: testOrganizationID,
		identity:       developerIdentity{key: "email:developer@example.com"},
		hour:           observedAt,
	}})
	if len(targets) != 1 || targets[0].userAccountID != nil || targets[0].userKey != "email:developer@example.com" {
		t.Fatalf("dailyTargets() = %#v; want fallback target with nil account ID", targets)
	}
}

func TestAddDecimalRejectsInvalidPersistedValue(t *testing.T) {
	if _, err := addDecimal("not-a-number", "1.00000000", 8); err == nil {
		t.Fatal("addDecimal() error = nil; want invalid persisted decimal error")
	}
}

func TestRunRetentionBacksOffAfterFailure(t *testing.T) {
	database := dalmocks.NewDal(t)
	converter := newRawMetricConverter(database, nil)
	now := time.Date(2026, 9, 16, 12, 0, 0, 0, time.UTC)
	converter.now = func() time.Time { return now }
	database.On("Pluck", "id", mock.Anything, mock.Anything).Return(devlakeerrors.Default.New("retention lookup failed")).Once()

	if err := converter.runRetention(); err == nil {
		t.Fatal("runRetention() error = nil; want lookup failure")
	}
	if !converter.nextRetentionAt.Equal(now.Add(retentionInterval)) {
		t.Fatalf("nextRetentionAt = %s; want %s", converter.nextRetentionAt, now.Add(retentionInterval))
	}
	if err := converter.runRetention(); err != nil {
		t.Fatalf("runRetention() during backoff = %v; want nil", err)
	}
}

func TestRecordPermanentFailureMarksTerminalTime(t *testing.T) {
	database := dalmocks.NewDal(t)
	converter := newRawMetricConverter(database, nil)
	now := time.Date(2026, 9, 16, 12, 0, 0, 0, time.UTC)
	converter.now = func() time.Time { return now }
	database.EXPECT().UpdateColumns(mock.Anything, mock.Anything, mock.Anything).Run(
		func(_ interface{}, sets []dal.DalSet, _ ...dal.Clause) {
			for _, set := range sets {
				if set.ColumnName != "processed_at" {
					continue
				}
				if actual, ok := set.Value.(time.Time); ok && actual.Equal(now) {
					return
				}
			}
			t.Fatalf("recordFailure() did not record terminal processed_at: %#v", sets)
		},
	).Return(nil).Once()

	err := converter.recordFailure(
		&models.OtelMetricBatch{Model: common.Model{ID: 12}, AttemptCount: 1},
		"worker",
		permanentMetricError(errorInvalidPayload, "invalid payload"),
	)
	if err != nil {
		t.Fatalf("recordFailure() error = %v", err)
	}
}

func TestPrepareUpdatesRejectsMalformedSupportedMetric(t *testing.T) {
	observedAt := time.Now().UTC()
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform", Model: common.Model{CreatedAt: observedAt.Add(-time.Hour)}}})
	request := newConverterRequest(observedAt, testOrganizationID)
	metric := request.ResourceMetrics[0].ScopeMetrics[0].Metrics[1]
	metric.GetSum().DataPoints[0].Attributes = []*commonv1.KeyValue{
		stringAttribute(devlakeTeamAttribute, "platform"),
		stringAttribute("user.account_id", "user_012pKEfgvvBR2CYw6KjnyAW2"),
		stringAttribute(organizationIDAttribute, testOrganizationID),
		stringAttribute("type", "input"),
	}

	_, err := newRawMetricConverter(database, nil).prepareUpdates(request)
	if conversionErr, ok := err.(*conversionError); !ok || !conversionErr.permanent || conversionErr.code != errorInvalidDimension {
		t.Fatalf("prepareUpdates() error = %v, want whole-batch permanent invalid_dimension", err)
	}
}

func TestPrepareUpdatesSkipsOnlyResourceGroupsWithAttributionFailures(t *testing.T) {
	observedAt := time.Date(2026, 9, 14, 10, 15, 0, 0, time.UTC)
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform", Model: common.Model{ID: 7, CreatedAt: observedAt.Add(-time.Hour)}}})
	request := newConverterRequest(observedAt, testOrganizationID)
	unknownTeam := proto.Clone(request.ResourceMetrics[0]).(*metricsv1.ResourceMetrics)
	for _, metric := range unknownTeam.ScopeMetrics[0].Metrics {
		for _, point := range metric.GetSum().DataPoints {
			point.Attributes[0] = stringAttribute(devlakeTeamAttribute, "deleted-team")
		}
	}
	request.ResourceMetrics = append([]*metricsv1.ResourceMetrics{unknownTeam}, request.ResourceMetrics...)

	prepared, err := newRawMetricConverter(database, nil).prepareUpdates(request)
	if err != nil {
		t.Fatalf("prepareUpdates() error = %v", err)
	}
	if len(prepared.updates) != 3 || prepared.skippedCount != 1 {
		t.Fatalf("prepareUpdates() updates=%d skipped=%d, want 3 valid updates and 1 skipped resource", len(prepared.updates), prepared.skippedCount)
	}
	for _, update := range prepared.updates {
		if update.connection.TeamSlug != "platform" {
			t.Fatalf("update team = %q, want only the valid resource", update.connection.TeamSlug)
		}
	}
	if code := prepared.diagnosticCode(); code == nil || *code != string(diagnosticResourcesSkipped) || prepared.diagnostic() == nil {
		t.Fatalf("diagnostic = %v/%v, want bounded resources_skipped diagnostic", code, prepared.diagnostic())
	}
}

func TestPrepareUpdatesSkipsUntrustedProjectAttributionWithoutDroppingOtherResources(t *testing.T) {
	observedAt := time.Date(2026, 9, 14, 10, 15, 0, 0, time.UTC)
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform", Model: common.Model{ID: 7, CreatedAt: observedAt.Add(-time.Hour)}}})
	request := newConverterRequest(observedAt, testOrganizationID)
	invalidResource := proto.Clone(request.ResourceMetrics[0]).(*metricsv1.ResourceMetrics)
	invalidResource.ScopeMetrics[0].Metrics[0].GetSum().DataPoints[0].Attributes = append(
		invalidResource.ScopeMetrics[0].Metrics[0].GetSum().DataPoints[0].Attributes,
		stringAttribute(devlakeProjectAttribute, "spoofed-project"),
	)
	request.ResourceMetrics = append([]*metricsv1.ResourceMetrics{invalidResource}, request.ResourceMetrics...)

	prepared, err := newRawMetricConverter(database, nil).prepareUpdates(request)
	if err != nil {
		t.Fatalf("prepareUpdates() error = %v", err)
	}
	if len(prepared.updates) != 3 || prepared.skippedCount != 1 {
		t.Fatalf("prepareUpdates() updates=%d skipped=%d, want 3 valid updates and 1 skipped resource", len(prepared.updates), prepared.skippedCount)
	}
}

func TestMetricSeriesHashIncludesInstrumentationScope(t *testing.T) {
	point := &metricsv1.NumberDataPoint{StartTimeUnixNano: 1, Attributes: []*commonv1.KeyValue{stringAttribute("model", "claude-sonnet")}}
	metric := &metricsv1.Metric{Name: metricTokenUsage}
	resourceAttributes := []*commonv1.KeyValue{stringAttribute("service.name", "claude-code")}
	first := metricSeriesHash(1, &commonv1.InstrumentationScope{Name: "claude-code", Version: "1"}, metric, resourceAttributes, point)
	second := metricSeriesHash(1, &commonv1.InstrumentationScope{Name: "claude-code", Version: "2"}, metric, resourceAttributes, point)
	if string(first) == string(second) {
		t.Fatal("metricSeriesHash() merged distinct instrumentation scopes")
	}
}

func TestReplayRejectsCumulativeTelemetryWithoutMutatingDay(t *testing.T) {
	observedAt := time.Date(2026, 9, 14, 10, 15, 0, 0, time.UTC)
	request := newConverterRequest(observedAt, testOrganizationID)
	metrics := request.ResourceMetrics[0].ScopeMetrics[0].Metrics
	metrics[len(metrics)-1].GetSum().AggregationTemporality = metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_CUMULATIVE
	payload, err := proto.Marshal(request)
	if err != nil {
		t.Fatalf("proto.Marshal() error = %v", err)
	}
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform", Model: common.Model{ID: 7, CreatedAt: observedAt.Add(-time.Hour)}}})
	converter := newRawMetricConverter(database, nil)
	existing := &hourlyAggregate{value: big.NewRat(99, 1)}
	aggregates := map[string]*hourlyAggregate{"existing": existing}
	processed, skippedErr, replayErr := converter.replayBatch(
		&models.OtelMetricBatch{PayloadProto: payload, PayloadSchemaVersion: otelPayloadSchemaVersion, Status: models.OtelMetricBatchStatusProcessed},
		observedAt.Truncate(24*time.Hour),
		observedAt.Truncate(24*time.Hour).Add(24*time.Hour),
		aggregates,
	)
	if processed || skippedErr != nil || replayErr == nil {
		t.Fatalf("replayBatch() = %t, %v, %v; want cumulative replay abort", processed, skippedErr, replayErr)
	}
	if len(aggregates) != 1 || aggregates["existing"] != existing || existing.value.RatString() != "99" {
		t.Fatalf("replayBatch() mutated aggregates before rejecting cumulative telemetry: %#v", aggregates)
	}
}

func TestReplayBatchAbortsForUnreadableProcessedPayload(t *testing.T) {
	processed, skippedErr, replayErr := newRawMetricConverter(nil, nil).replayBatch(
		&models.OtelMetricBatch{Model: common.Model{ID: 42}, PayloadProto: []byte("not protobuf"), PayloadSchemaVersion: otelPayloadSchemaVersion, Status: models.OtelMetricBatchStatusProcessed},
		time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 9, 15, 0, 0, 0, 0, time.UTC),
		make(map[string]*hourlyAggregate),
	)
	if processed || skippedErr != nil || replayErr == nil {
		t.Fatalf("replayBatch() = %t, %v, %v; want processed decode abort", processed, skippedErr, replayErr)
	}
	code, permanent, _ := classifyConversionError(replayErr)
	if code != errorInvalidPayload || !permanent {
		t.Fatalf("decode abort = %s permanent=%t; want %s permanent", code, permanent, errorInvalidPayload)
	}

	t.Run("unsupported schema", func(t *testing.T) {
		existing := &hourlyAggregate{value: big.NewRat(99, 1)}
		aggregates := map[string]*hourlyAggregate{"existing": existing}
		processed, skippedErr, replayErr := newRawMetricConverter(nil, nil).replayBatch(
			&models.OtelMetricBatch{Model: common.Model{ID: 43}, PayloadProto: []byte("validity is irrelevant before schema validation"), PayloadSchemaVersion: otelPayloadSchemaVersion + 1, Status: models.OtelMetricBatchStatusProcessed},
			time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC),
			time.Date(2026, 9, 15, 0, 0, 0, 0, time.UTC),
			aggregates,
		)
		if processed || skippedErr != nil || replayErr == nil {
			t.Fatalf("replayBatch() = %t, %v, %v; want unsupported-schema abort", processed, skippedErr, replayErr)
		}
		if len(aggregates) != 1 || aggregates["existing"] != existing || existing.value.RatString() != "99" {
			t.Fatalf("replayBatch() mutated aggregates before rejecting unsupported schema: %#v", aggregates)
		}
	})
}

func TestReplayBatchSkipsUnreadablePermanentErrorPayload(t *testing.T) {
	processed, skippedErr, replayErr := newRawMetricConverter(nil, nil).replayBatch(
		&models.OtelMetricBatch{Model: common.Model{ID: 42}, PayloadProto: []byte("not protobuf"), PayloadSchemaVersion: otelPayloadSchemaVersion, Status: models.OtelMetricBatchStatusPermanentError},
		time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 9, 15, 0, 0, 0, 0, time.UTC),
		make(map[string]*hourlyAggregate),
	)
	if processed || skippedErr == nil || replayErr != nil {
		t.Fatalf("replayBatch() = %t, %v, %v; want permanently quarantined decode skip", processed, skippedErr, replayErr)
	}
	diagnostics := replayDiagnostics{}
	diagnostics.add(42, skippedErr)
	message := diagnostics.message()
	if message == nil ||
		!strings.Contains(*message, "batch=42 code=invalid_payload reason=stored payload could not be decoded detail=") ||
		strings.Contains(*message, "not protobuf") {
		t.Fatalf("replay diagnostic = %v; want bounded safe batch/code/reason/detail with no payload content", message)
	}
}

func TestTruncateBoundsDiagnosticDetail(t *testing.T) {
	if got := truncate("short", 120); got != "short" {
		t.Fatalf("truncate() = %q, want unchanged string under the limit", got)
	}
	long := strings.Repeat("x", 200)
	if got := truncate(long, replayDiagnosticDetailLimit); len([]rune(got)) != replayDiagnosticDetailLimit {
		t.Fatalf("truncate() length = %d, want %d", len([]rune(got)), replayDiagnosticDetailLimit)
	}
}

func TestReplayBatchAbortsOnRetryablePreparationFailure(t *testing.T) {
	observedAt := time.Date(2026, 9, 14, 10, 15, 0, 0, time.UTC)
	request := newConverterRequest(observedAt, testOrganizationID)
	payload, err := proto.Marshal(request)
	if err != nil {
		t.Fatalf("proto.Marshal() error = %v", err)
	}
	database := dalmocks.NewDal(t)
	database.EXPECT().All(mock.AnythingOfType("*[]*models.OtelConnection"), mock.Anything).Return(devlakeerrors.Default.New("database unavailable"))

	processed, skippedErr, replayErr := newRawMetricConverter(database, nil).replayBatch(
		&models.OtelMetricBatch{PayloadProto: payload, PayloadSchemaVersion: otelPayloadSchemaVersion, Status: models.OtelMetricBatchStatusProcessed},
		observedAt.Truncate(24*time.Hour),
		observedAt.Truncate(24*time.Hour).Add(24*time.Hour),
		make(map[string]*hourlyAggregate),
	)
	if processed || skippedErr != nil || replayErr == nil {
		t.Fatalf("replayBatch() = %t, %v, %v; want retryable preparation abort", processed, skippedErr, replayErr)
	}
	_, permanent, _ := classifyConversionError(replayErr)
	if permanent {
		t.Fatalf("replay preparation error = %v; want retryable", replayErr)
	}
}

func TestReplayRejectsCurrentUTCDate(t *testing.T) {
	now := time.Date(2026, 9, 15, 10, 0, 0, 0, time.UTC)
	converter := newRawMetricConverter(nil, nil)
	converter.now = func() time.Time { return now }
	request := &models.OtelReplayRequest{
		RangeStart: now.Truncate(24 * time.Hour),
		RangeEnd:   now.Truncate(24 * time.Hour).Add(24 * time.Hour),
	}
	if err := converter.validateReplayRange(request); err == nil {
		t.Fatal("validateReplayRange() error = nil, want current UTC day rejection")
	}
}

func TestReplayDeltaBatchesRebuildStableHourlyAggregates(t *testing.T) {
	firstObservedAt := time.Date(2026, 9, 14, 10, 15, 0, 0, time.UTC)
	secondObservedAt := firstObservedAt.Add(time.Hour)
	first := newConverterRequest(firstObservedAt, testOrganizationID)
	second := newConverterRequest(secondObservedAt, testOrganizationID)
	second.ResourceMetrics[0].ScopeMetrics[0].Metrics[1].GetSum().DataPoints[0].Value = &metricsv1.NumberDataPoint_AsInt{AsInt: 20}

	marshalBatch := func(request *collectormetrics.ExportMetricsServiceRequest) *models.OtelMetricBatch {
		payload, err := proto.Marshal(request)
		if err != nil {
			t.Fatalf("proto.Marshal() error = %v", err)
		}
		return &models.OtelMetricBatch{PayloadProto: payload, PayloadSchemaVersion: otelPayloadSchemaVersion, Status: models.OtelMetricBatchStatusProcessed}
	}
	batches := []*models.OtelMetricBatch{marshalBatch(first), marshalBatch(second)}
	rebuild := func() map[string]*hourlyAggregate {
		aggregates := make(map[string]*hourlyAggregate)
		database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform", Model: common.Model{ID: 7, CreatedAt: firstObservedAt.Add(-time.Hour)}}})
		converter := newRawMetricConverter(database, nil)
		for _, batch := range batches {
			processed, skippedErr, err := converter.replayBatch(batch, firstObservedAt.Truncate(24*time.Hour), firstObservedAt.Truncate(24*time.Hour).Add(24*time.Hour), aggregates)
			if err != nil || skippedErr != nil || !processed {
				t.Fatalf("replayBatch() = %t, %v, %v", processed, skippedErr, err)
			}
		}
		return aggregates
	}

	firstRebuild := rebuild()
	secondRebuild := rebuild()
	for _, rebuild := range []map[string]*hourlyAggregate{firstRebuild, secondRebuild} {
		var total big.Rat
		for _, aggregate := range rebuild {
			if aggregate.update.fact == hourlyModelUsageFact && aggregate.update.column == "input_tokens" {
				total.Add(&total, aggregate.value)
			}
		}
		if total.RatString() != "30" {
			t.Fatalf("replayed input token total = %s, want 30", total.RatString())
		}
	}
}

func TestCounterDeltaUsesExactCumulativeIncreaseResetAndOrder(t *testing.T) {
	testCases := []struct {
		name         string
		stored       string
		current      string
		timeNanos    uint64
		wantIncrease string
		wantCode     conversionErrorCode
	}{
		{name: "exact decimal increase", stored: "0.092484000", current: "0.192484", timeNanos: 30, wantIncrease: "0.100000000"},
		{name: "lower value is a reset", stored: "10", current: "3", timeNanos: 30, wantIncrease: "3.000000000"},
		{name: "out of order sample", stored: "10", current: "12", timeNanos: 20, wantCode: errorOutOfOrderCumulative},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			transaction := dalmocks.NewTransaction(t)
			stored := testCase.stored
			transaction.EXPECT().First(mock.AnythingOfType("*models.OtelMetricSeriesState"), mock.Anything, mock.Anything).Run(
				func(state interface{}, _ ...dal.Clause) {
					*state.(*models.OtelMetricSeriesState) = models.OtelMetricSeriesState{LastTimeUnixNano: 20, LastNumberValue: &stored}
				},
			).Return(nil)
			transaction.EXPECT().IsErrorNotFound(nil).Return(false).Maybe()
			if testCase.wantCode == "" {
				transaction.EXPECT().CreateOrUpdate(mock.AnythingOfType("*models.OtelMetricSeriesState")).Return(nil)
			}
			current, _ := new(big.Rat).SetString(testCase.current)

			increase, err := newRawMetricConverter(nil, nil).counterDelta(transaction, factUpdate{
				connection:  &models.OtelConnection{},
				metric:      metricCostUsage,
				value:       metricNumber{value: current},
				temporality: metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_CUMULATIVE,
				timeNanos:   testCase.timeNanos,
				seriesHash:  make([]byte, 32),
			})
			if testCase.wantCode != "" {
				if conversionErr, ok := err.(*conversionError); !ok || conversionErr.code != testCase.wantCode || !conversionErr.permanent {
					t.Fatalf("counterDelta() error = %v, want permanent %s", err, testCase.wantCode)
				}
				return
			}
			if err != nil || increase.decimalString() != testCase.wantIncrease {
				t.Fatalf("counterDelta() = %v, %v; want %s", increase.value, err, testCase.wantIncrease)
			}
		})
	}
}

func TestRealShapedClaudeCodeExportIsAcceptedAndConverted(t *testing.T) {
	payload, err := os.ReadFile("testdata/claude_code_delta_metrics.json")
	if err != nil {
		t.Fatalf("ReadFile() error = %v", err)
	}
	request := &collectormetrics.ExportMetricsServiceRequest{}
	if err := protojson.Unmarshal(payload, request); err != nil {
		t.Fatalf("protojson.Unmarshal() error = %v", err)
	}
	_, datapointCount, validationErr := validateOtelMetricsRequest(request)
	if validationErr != nil {
		t.Fatalf("validateOtelMetricsRequest() error = %v", validationErr)
	}
	database := newConnectionLookup(t, map[string]*models.OtelConnection{"platform": {TeamSlug: "platform"}})

	prepared, err := newRawMetricConverter(database, nil).prepareUpdates(request)
	if err != nil {
		t.Fatalf("prepareUpdates() error = %v", err)
	}
	if len(prepared.updates) != datapointCount || prepared.skippedCount != 0 {
		t.Fatalf("prepareUpdates() updates=%d skipped=%d, want every supported datapoint (%d)", len(prepared.updates), prepared.skippedCount, datapointCount)
	}
	for _, update := range prepared.updates {
		if update.temporality != metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA || update.organizationID != testOrganizationID {
			t.Fatalf("%s temporality/organization = %s/%q", update.metric, update.temporality, update.organizationID)
		}
	}
}

func TestResolveConnectionUsesEventTimeAcrossRevokedAndRecreatedTeam(t *testing.T) {
	revokedAt := time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)
	revoked := &models.OtelConnection{Model: common.Model{ID: 1, CreatedAt: revokedAt.Add(-24 * time.Hour)}, TeamSlug: "platform", RevokedAt: &revokedAt}
	recreated := &models.OtelConnection{Model: common.Model{ID: 2, CreatedAt: revokedAt.Add(time.Hour)}, TeamSlug: "platform"}
	database := dalmocks.NewDal(t)
	database.EXPECT().All(mock.AnythingOfType("*[]*models.OtelConnection"), mock.Anything).Run(
		func(connections interface{}, _ ...dal.Clause) {
			*connections.(*[]*models.OtelConnection) = []*models.OtelConnection{revoked, recreated}
		},
	).Return(nil).Once()
	preparer := &batchPreparer{converter: newRawMetricConverter(database, nil), connections: make(map[string][]*models.OtelConnection)}

	testCases := []struct {
		name       string
		observedAt time.Time
		wantID     uint64
	}{
		{name: "delayed telemetry before revocation", observedAt: revokedAt.Add(-time.Minute), wantID: revoked.ID},
		{name: "telemetry after recreation", observedAt: revokedAt.Add(2 * time.Hour), wantID: recreated.ID},
		{name: "telemetry between revocation and recreation", observedAt: revokedAt.Add(time.Minute)},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			connection, err := preparer.resolveConnection("platform", testCase.observedAt)
			if testCase.wantID == 0 {
				if conversionErr, ok := err.(*conversionError); !ok || conversionErr.code != errorConnectionNotFound {
					t.Fatalf("resolveConnection() error = %v, want connection_not_found", err)
				}
				return
			}
			if err != nil || connection.ID != testCase.wantID {
				t.Fatalf("resolveConnection() = %#v, %v; want connection %d", connection, err, testCase.wantID)
			}
		})
	}
}

func TestAcquireLeaseRejectsSecondConverterWhileLeaseIsHeld(t *testing.T) {
	database := dalmocks.NewDal(t)
	transaction := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(transaction)
	transaction.EXPECT().CreateIfNotExist(mock.AnythingOfType("*models.OtelConverterLease")).Return(nil)
	transaction.EXPECT().UpdateColumns(mock.AnythingOfType("*models.OtelConverterLease"), mock.Anything, mock.Anything).Return(nil)
	transaction.EXPECT().First(mock.AnythingOfType("*models.OtelConverterLease"), mock.Anything, mock.Anything).Run(
		func(lease interface{}, _ ...dal.Clause) {
			lease.(*models.OtelConverterLease).Owner = "first-converter"
		},
	).Return(nil)
	transaction.EXPECT().Commit().Return(nil)

	leader, err := newRawMetricConverter(database, nil).acquireLease()
	if err != nil || leader {
		t.Fatalf("acquireLease() = %v, %v; want the second converter to stand by", leader, err)
	}
}

// TestCommitReplayAbortsWhenConverterLeaseWasTakenOver guards the fix for a real race: a
// replay's own request-row lease used to be the only thing commitReplay checked, so a replay
// that outlived the global converterLeaseDuration could still commit its delete-and-replace
// after another replica had already taken over the global lease and started live-converting
// the same range. commitReplay must now also fence on the global lease, inside the same
// transaction, and must never reach replaceReplayRange's deletes once that fence trips.
func TestCommitReplayAbortsWhenConverterLeaseWasTakenOver(t *testing.T) {
	now := time.Date(2026, 9, 15, 10, 0, 0, 0, time.UTC)
	leaseOwner := "replay-lease-owner"
	requestLeaseUntil := now.Add(time.Minute)

	database := dalmocks.NewDal(t)
	transaction := dalmocks.NewTransaction(t)
	database.EXPECT().Begin().Return(transaction)
	transaction.EXPECT().First(mock.AnythingOfType("*models.OtelReplayRequest"), mock.Anything, mock.Anything, mock.Anything).Run(
		func(request interface{}, _ ...dal.Clause) {
			*request.(*models.OtelReplayRequest) = models.OtelReplayRequest{
				Model:      common.Model{ID: 1},
				Status:     models.OtelReplayRequestStatusProcessing,
				LeaseOwner: &leaseOwner,
				LeaseUntil: &requestLeaseUntil,
			}
		},
	).Return(nil)
	// Simulates a second replica having taken over the global converter lease while this
	// replay was still running, the exact scenario a long replay used to be blind to.
	transaction.EXPECT().First(mock.AnythingOfType("*models.OtelConverterLease"), mock.Anything, mock.Anything).Run(
		func(lease interface{}, _ ...dal.Clause) {
			lease.(*models.OtelConverterLease).Owner = "second-converter"
			lease.(*models.OtelConverterLease).LeaseUntil = now.Add(time.Minute)
		},
	).Return(nil)
	transaction.EXPECT().Rollback().Return(nil)
	// No Delete/Exec/UpdateColumns expectations are registered on the transaction: if
	// commitReplay reached replaceReplayRange despite the lost lease, the mock would fail on
	// the first unexpected call, so this also proves the delete-and-replace never ran.

	converter := newRawMetricConverter(database, nil)
	converter.workerID = "first-converter"
	converter.now = func() time.Time { return now }
	aggregates := map[string]*hourlyAggregate{
		"key": {update: factUpdate{connection: &models.OtelConnection{}, fact: hourlyActivityFact}, value: big.NewRat(1, 1)},
	}

	err := converter.commitReplayDay(1, leaseOwner, now.Truncate(24*time.Hour), aggregates, 1, 0, nil)
	if !stdErrors.Is(err, errReplayLeaseLost) {
		t.Fatalf("commitReplay() error = %v, want errReplayLeaseLost", err)
	}
}

func TestClaimNextWaitsBehindRetryDelayedHeadBatch(t *testing.T) {
	now := time.Date(2026, 9, 14, 10, 0, 0, 0, time.UTC)
	nextAttemptAt := now.Add(time.Minute)
	database := dalmocks.NewDal(t)
	database.EXPECT().First(mock.AnythingOfType("*models.OtelMetricBatch"), mock.Anything, mock.Anything, mock.Anything).Run(
		func(batch interface{}, _ ...dal.Clause) {
			*batch.(*models.OtelMetricBatch) = models.OtelMetricBatch{Status: models.OtelMetricBatchStatusRetryableError, NextAttemptAt: &nextAttemptAt}
		},
	).Return(nil)
	converter := newRawMetricConverter(database, nil)
	converter.now = func() time.Time { return now }

	batch, _, err := converter.claimNext()
	if err != nil || batch != nil {
		t.Fatalf("claimNext() = %#v, %v; want no claim while the head batch waits for retry", batch, err)
	}
}

func TestDailyTargetsAggregateTeamsIntoOneOrganizationCandidate(t *testing.T) {
	accountID := "user_012pKEfgvvBR2CYw6KjnyAW2"
	hour := time.Date(2026, 9, 14, 10, 0, 0, 0, time.UTC)
	targets := dailyTargets([]factUpdate{
		{connection: &models.OtelConnection{TeamSlug: "backend"}, organizationID: testOrganizationID, identity: developerIdentity{key: "acct:" + accountID, accountID: &accountID}, hour: hour},
		{connection: &models.OtelConnection{TeamSlug: "frontend"}, organizationID: testOrganizationID, identity: developerIdentity{key: "acct:" + accountID, accountID: &accountID}, hour: hour.Add(time.Hour)},
	})
	if len(targets) != 1 {
		t.Fatalf("daily targets = %d, want one organization-wide candidate", len(targets))
	}
	if targets[0].workspaceKey != testOrganizationID || targets[0].userKey != "acct:"+accountID {
		t.Fatalf("daily target = %#v", targets[0])
	}
}

// newConnectionLookup serves team connections by the team_slug lookup parameter.
func newConnectionLookup(t *testing.T, connections map[string]*models.OtelConnection) *dalmocks.Dal {
	database := dalmocks.NewDal(t)
	database.EXPECT().All(mock.AnythingOfType("*[]*models.OtelConnection"), mock.Anything).Run(
		func(result interface{}, clauses ...dal.Clause) {
			teamSlug := clauses[0].Data.(dal.DalClause).Params[0].(string)
			if connection := connections[teamSlug]; connection != nil {
				*result.(*[]*models.OtelConnection) = []*models.OtelConnection{connection}
			}
		},
	).Return(nil)
	return database
}

func newConverterRequest(observedAt time.Time, organizationID string) *collectormetrics.ExportMetricsServiceRequest {
	pointAttributes := []*commonv1.KeyValue{
		stringAttribute(devlakeTeamAttribute, "platform"),
		stringAttribute("user.account_id", "user_012pKEfgvvBR2CYw6KjnyAW2"),
		stringAttribute("user.account_uuid", "aaaa1111-1111-4111-8111-111111111111"),
		stringAttribute("user.email", "Developer@example.com"),
		stringAttribute(organizationIDAttribute, organizationID),
		stringAttribute("model", "claude-sonnet-4-20250514"),
		stringAttribute("query_source", "main"),
		stringAttribute("tool_name", "Edit"),
		stringAttribute("decision", "accept"),
		stringAttribute("language", "go"),
	}
	point := func(value int64, extra ...*commonv1.KeyValue) *metricsv1.NumberDataPoint {
		return &metricsv1.NumberDataPoint{Attributes: append(append([]*commonv1.KeyValue{}, pointAttributes...), extra...), TimeUnixNano: uint64(observedAt.UnixNano()), Value: &metricsv1.NumberDataPoint_AsInt{AsInt: value}}
	}
	sum := func(name string, datapoint *metricsv1.NumberDataPoint) *metricsv1.Metric {
		return &metricsv1.Metric{Name: name, Data: &metricsv1.Metric_Sum{Sum: &metricsv1.Sum{
			AggregationTemporality: metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA,
			DataPoints:             []*metricsv1.NumberDataPoint{datapoint},
		}}}
	}
	return &collectormetrics.ExportMetricsServiceRequest{ResourceMetrics: []*metricsv1.ResourceMetrics{{
		Resource: &resourcev1.Resource{Attributes: []*commonv1.KeyValue{stringAttribute("service.name", "claude-code")}},
		ScopeMetrics: []*metricsv1.ScopeMetrics{{Metrics: []*metricsv1.Metric{
			sum(metricSessionCount, point(1)),
			sum(metricTokenUsage, point(10, stringAttribute("type", "input"))),
			sum(metricToolDecision, point(2)),
		}}},
	}}}
}
