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
	"fmt"
	"math/big"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	metricsv1 "go.opentelemetry.io/proto/otlp/metrics/v1"
	"google.golang.org/protobuf/proto"
)

const (
	replayMaxRange  = 31 * 24 * time.Hour
	replayBatchPage = 100
)

var replayableBatchStatuses = []string{models.OtelMetricBatchStatusProcessed, models.OtelMetricBatchStatusPermanentError}

// processNextReplay runs the oldest pending replay request. A request left processing by
// a previous leader is rerun; a rebuild commits in one transaction and is idempotent.
func (c *rawMetricConverter) processNextReplay() (bool, errors.Error) {
	request := &models.OtelReplayRequest{}
	err := c.db.First(request,
		dal.Where("status IN ?", []string{models.OtelReplayRequestStatusPending, models.OtelReplayRequestStatusProcessing}),
		dal.Orderby("id ASC"),
	)
	if err != nil {
		if c.db.IsErrorNotFound(err) {
			return false, nil
		}
		return false, errors.Default.Wrap(err, "failed to find Claude Code OTel replay request")
	}
	if err := c.db.UpdateColumn(&models.OtelReplayRequest{}, "status", models.OtelReplayRequestStatusProcessing, dal.Where("id = ?", request.ID)); err != nil {
		return false, errors.Default.Wrap(err, "failed to start Claude Code OTel replay request")
	}
	replayed, skipped, replayErr := c.replay(request)
	if replayErr != nil {
		c.logWarn(replayErr, fmt.Sprintf("Claude Code OTel replay request %d failed", request.ID))
		message := replayErr.Error()
		return true, c.finishReplay(request.ID, models.OtelReplayRequestStatusFailed, replayed, skipped, &message)
	}
	return true, c.finishReplay(request.ID, models.OtelReplayRequestStatusCompleted, replayed, skipped, nil)
}

func (c *rawMetricConverter) finishReplay(requestID uint64, status string, replayed, skipped int, message *string) errors.Error {
	err := c.db.UpdateColumns(&models.OtelReplayRequest{}, []dal.DalSet{
		{ColumnName: "status", Value: status},
		{ColumnName: "replayed_batches", Value: replayed},
		{ColumnName: "skipped_batches", Value: skipped},
		{ColumnName: "error_message", Value: message},
		{ColumnName: "completed_at", Value: c.now().UTC()},
	}, dal.Where("id = ?", requestID))
	if err != nil {
		return errors.Default.Wrap(err, fmt.Sprintf("failed to record Claude Code OTel replay request %d result", requestID))
	}
	return nil
}

func (c *rawMetricConverter) validateReplayRange(request *models.OtelReplayRequest) error {
	start, end := request.RangeStart.UTC(), request.RangeEnd.UTC()
	if !start.Equal(start.Truncate(24*time.Hour)) || !end.Equal(end.Truncate(24*time.Hour)) {
		return fmt.Errorf("replay range must start and end at UTC midnight")
	}
	if !start.Before(end) || end.Sub(start) > replayMaxRange {
		return fmt.Errorf("replay range must be between one and %d days", int(replayMaxRange.Hours()/24))
	}
	if start.Before(c.now().UTC().Add(-rawBatchRetention)) {
		return fmt.Errorf("replay range starts before retained raw telemetry")
	}
	return nil
}

// hourlyAggregate is one rebuilt hourly fact column; update.observedAt holds its first observation.
type hourlyAggregate struct {
	update         factUpdate
	value          *big.Rat
	lastObservedAt time.Time
}

// replay rebuilds hourly facts and canonical daily rows for whole UTC days from Claude
// Code's default DELTA exports. Persisted live series state is left untouched.
func (c *rawMetricConverter) replay(request *models.OtelReplayRequest) (int, int, error) {
	if err := c.validateReplayRange(request); err != nil {
		return 0, 0, err
	}
	rangeStart, rangeEnd := request.RangeStart.UTC(), request.RangeEnd.UTC()
	aggregates := make(map[string]*hourlyAggregate)
	replayed, skipped := 0, 0
	var lastBatchID uint64
	for {
		batches := make([]*models.OtelMetricBatch, 0, replayBatchPage)
		if err := c.db.All(&batches,
			dal.Where("id > ? AND status IN ? AND max_observed_at >= ? AND min_observed_at < ?", lastBatchID, replayableBatchStatuses, rangeStart, rangeEnd),
			dal.Orderby("id ASC"),
			dal.Limit(replayBatchPage),
		); err != nil {
			return replayed, skipped, fmt.Errorf("load raw batches for replay: %w", err)
		}
		for _, batch := range batches {
			lastBatchID = batch.ID
			processed, replayErr := c.replayBatch(batch, rangeStart, rangeEnd, aggregates)
			if replayErr != nil {
				return replayed, skipped, replayErr
			}
			if processed {
				replayed++
			} else {
				skipped++
			}
		}
		if len(batches) < replayBatchPage {
			break
		}
	}
	if leader, err := c.acquireLease(); err != nil || !leader {
		return replayed, skipped, fmt.Errorf("converter lease was lost during replay: %v", err)
	}
	return replayed, skipped, c.commitReplay(rangeStart, rangeEnd, aggregates)
}

// replayBatch adds one raw batch's in-range increases to the aggregates. It returns false
// when the batch cannot be prepared, which live conversion also quarantined. Cumulative
// replay requires a durable predecessor checkpoint, which v1 does not retain; refusing it
// is safer than rebuilding a range with an unprovable first increase.
func (c *rawMetricConverter) replayBatch(batch *models.OtelMetricBatch, rangeStart, rangeEnd time.Time, aggregates map[string]*hourlyAggregate) (bool, error) {
	request := &collectormetrics.ExportMetricsServiceRequest{}
	if err := proto.Unmarshal(batch.PayloadProto, request); err != nil {
		return false, nil
	}
	prepared, err := c.prepareUpdates(request)
	if err != nil {
		return false, nil
	}
	for _, update := range prepared.updates {
		if update.temporality == metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_CUMULATIVE {
			return false, fmt.Errorf("replay contains cumulative telemetry; a predecessor checkpoint is required")
		}
		if update.hour.Before(rangeStart) || !update.hour.Before(rangeEnd) {
			continue
		}
		key := hourlyAggregateKey(update)
		aggregate := aggregates[key]
		if aggregate == nil {
			aggregate = &hourlyAggregate{update: update, value: new(big.Rat), lastObservedAt: update.observedAt}
			aggregates[key] = aggregate
		}
		aggregate.value.Add(aggregate.value, update.value.value)
		if update.observedAt.Before(aggregate.update.observedAt) {
			aggregate.update.observedAt = update.observedAt
		}
		if update.observedAt.After(aggregate.lastObservedAt) {
			aggregate.lastObservedAt = update.observedAt
		}
	}
	return true, nil
}

func hourlyAggregateKey(update factUpdate) string {
	return fmt.Sprintf("%d\x00%d\x00%s\x00%d\x00%s\x00%s\x00%s\x00%s\x00%s",
		update.fact, update.connection.ID, update.identity.key, update.hour.Unix(), update.model, update.query, update.tool, update.language, update.column)
}

// commitReplay replaces the range's hourly facts and canonical Claude OTel daily rows in
// one transaction.
func (c *rawMetricConverter) commitReplay(rangeStart, rangeEnd time.Time, aggregates map[string]*hourlyAggregate) error {
	tx := c.db.Begin()
	if err := c.replaceReplayRange(tx, rangeStart, rangeEnd, aggregates); err != nil {
		c.rollback(tx)
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit Claude Code OTel replay: %w", err)
	}
	return nil
}

func (c *rawMetricConverter) replaceReplayRange(tx dal.Transaction, rangeStart, rangeEnd time.Time, aggregates map[string]*hourlyAggregate) error {
	hourRange := dal.Where("hour_start >= ? AND hour_start < ?", rangeStart, rangeEnd)
	for _, fact := range []interface{}{&models.OtelHourlyActivity{}, &models.OtelHourlyModelUsage{}, &models.OtelHourlyToolUsage{}} {
		if err := tx.Delete(fact, hourRange); err != nil {
			return fmt.Errorf("delete hourly facts for replay: %w", err)
		}
	}
	canonicalRange := dal.Where("provider = ? AND source_type = ? AND date >= ? AND date < ?", aiProviderClaude, aiSourceOtel, rangeStart, rangeEnd)
	if err := tx.Delete(&ai.AiActivity{}, canonicalRange, dal.Where("record_kind = ?", ai.CanonicalActivityRecordKind)); err != nil {
		return fmt.Errorf("delete canonical activity for replay: %w", err)
	}
	for _, canonical := range []interface{}{&ai.AiModelUsage{}, &ai.AiToolDecision{}} {
		if err := tx.Delete(canonical, canonicalRange); err != nil {
			return fmt.Errorf("delete canonical facts for replay: %w", err)
		}
	}
	updates := make([]factUpdate, 0, len(aggregates))
	for _, aggregate := range aggregates {
		if err := bindConnectionOrganization(tx, aggregate.update.connection, aggregate.update.organizationID); err != nil {
			return err
		}
		if err := upsertHourlyFact(tx, aggregate.update, metricNumber{value: aggregate.value}, aggregate.lastObservedAt); err != nil {
			return fmt.Errorf("write replayed hourly facts: %w", err)
		}
		updates = append(updates, aggregate.update)
	}
	if err := reconcileOtelDaily(tx, dailyTargets(updates)); err != nil {
		return fmt.Errorf("write replayed canonical daily facts: %w", err)
	}
	return nil
}
