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
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/google/uuid"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	metricsv1 "go.opentelemetry.io/proto/otlp/metrics/v1"
	"google.golang.org/protobuf/proto"
)

const (
	replayMaxRange  = 31 * 24 * time.Hour
	replayBatchPage = 100
)

var replayableBatchStatuses = []string{models.OtelMetricBatchStatusProcessed, models.OtelMetricBatchStatusPermanentError}

var errReplayLeaseLost = stdErrors.New("Claude Code OTel replay lease was lost")

// processNextReplay claims the oldest pending or expired replay request. A request-level
// lease keeps a long rebuild owned even when the converter's short global lease turns over.
func (c *rawMetricConverter) processNextReplay() (bool, errors.Error) {
	request, leaseOwner, found, err := c.claimNextReplay()
	if err != nil || !found {
		return false, err
	}
	replayed, skipped, replayErr := c.replay(request, leaseOwner)
	if replayErr != nil {
		if stdErrors.Is(replayErr, errReplayLeaseLost) {
			return false, nil
		}
		c.logWarn(replayErr, fmt.Sprintf("Claude Code OTel replay request %d failed", request.ID))
		message := replayErr.Error()
		return true, c.finishReplay(request.ID, leaseOwner, models.OtelReplayRequestStatusFailed, replayed, skipped, &message)
	}
	return true, nil
}

func (c *rawMetricConverter) claimNextReplay() (*models.OtelReplayRequest, string, bool, errors.Error) {
	now := c.now().UTC()
	request := &models.OtelReplayRequest{}
	err := c.db.First(request,
		dal.Where("status = ? OR (status = ? AND (lease_until IS NULL OR lease_until < ?))", models.OtelReplayRequestStatusPending, models.OtelReplayRequestStatusProcessing, now),
		dal.Orderby("id ASC"),
	)
	if err != nil {
		if c.db.IsErrorNotFound(err) {
			return nil, "", false, nil
		}
		return nil, "", false, errors.Default.Wrap(err, "failed to find Claude Code OTel replay request")
	}
	leaseOwner := uuid.NewString()
	if err := c.db.UpdateColumns(&models.OtelReplayRequest{}, []dal.DalSet{
		{ColumnName: "status", Value: models.OtelReplayRequestStatusProcessing},
		{ColumnName: "lease_owner", Value: leaseOwner},
		{ColumnName: "lease_until", Value: now.Add(converterLeaseDuration)},
	}, dal.Where("id = ? AND (status = ? OR (status = ? AND (lease_until IS NULL OR lease_until < ?)))", request.ID, models.OtelReplayRequestStatusPending, models.OtelReplayRequestStatusProcessing, now)); err != nil {
		return nil, "", false, errors.Default.Wrap(err, "failed to claim Claude Code OTel replay request")
	}
	if err := c.db.First(request, dal.Where("id = ? AND status = ? AND lease_owner = ? AND lease_until > ?", request.ID, models.OtelReplayRequestStatusProcessing, leaseOwner, now)); err != nil {
		if c.db.IsErrorNotFound(err) {
			return nil, "", false, nil
		}
		return nil, "", false, errors.Default.Wrap(err, "failed to verify Claude Code OTel replay request lease")
	}
	return request, leaseOwner, true, nil
}

func (c *rawMetricConverter) renewReplayLease(requestID uint64, leaseOwner string) error {
	now := c.now().UTC()
	if err := c.db.UpdateColumn(&models.OtelReplayRequest{}, "lease_until", now.Add(converterLeaseDuration),
		dal.Where("id = ? AND status = ? AND lease_owner = ? AND lease_until > ?", requestID, models.OtelReplayRequestStatusProcessing, leaseOwner, now)); err != nil {
		return fmt.Errorf("renew replay request lease: %w", err)
	}
	request := &models.OtelReplayRequest{}
	if err := c.db.First(request, dal.Where("id = ? AND status = ? AND lease_owner = ? AND lease_until > ?", requestID, models.OtelReplayRequestStatusProcessing, leaseOwner, now)); err != nil {
		if c.db.IsErrorNotFound(err) {
			return errReplayLeaseLost
		}
		return fmt.Errorf("verify replay request lease: %w", err)
	}
	return nil
}

func (c *rawMetricConverter) finishReplay(requestID uint64, leaseOwner, status string, replayed, skipped int, message *string) errors.Error {
	err := c.db.UpdateColumns(&models.OtelReplayRequest{}, []dal.DalSet{
		{ColumnName: "status", Value: status},
		{ColumnName: "lease_owner", Value: nil},
		{ColumnName: "lease_until", Value: nil},
		{ColumnName: "replayed_batches", Value: replayed},
		{ColumnName: "skipped_batches", Value: skipped},
		{ColumnName: "error_message", Value: message},
		{ColumnName: "completed_at", Value: c.now().UTC()},
	}, dal.Where("id = ? AND status = ? AND lease_owner = ?", requestID, models.OtelReplayRequestStatusProcessing, leaseOwner))
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
	if end.After(c.now().UTC().Truncate(24 * time.Hour)) {
		return fmt.Errorf("replay range must contain completed UTC days only")
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
func (c *rawMetricConverter) replay(request *models.OtelReplayRequest, leaseOwner string) (int, int, error) {
	if err := c.validateReplayRange(request); err != nil {
		return 0, 0, err
	}
	rangeStart, rangeEnd := request.RangeStart.UTC(), request.RangeEnd.UTC()
	aggregates := make(map[string]*hourlyAggregate)
	replayed, skipped := 0, 0
	var lastBatchID uint64
	for {
		if err := c.renewReplayLease(request.ID, leaseOwner); err != nil {
			return replayed, skipped, err
		}
		batches := make([]*models.OtelMetricBatch, 0, replayBatchPage)
		if err := c.db.All(&batches,
			dal.Where("id > ? AND status IN ? AND max_observed_at >= ? AND min_observed_at < ?", lastBatchID, replayableBatchStatuses, rangeStart, rangeEnd),
			dal.Orderby("id ASC"),
			dal.Limit(replayBatchPage),
		); err != nil {
			return replayed, skipped, fmt.Errorf("load raw batches for replay: %w", err)
		}
		for _, batch := range batches {
			if err := c.renewReplayLease(request.ID, leaseOwner); err != nil {
				return replayed, skipped, err
			}
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
	return replayed, skipped, c.commitReplay(request.ID, leaseOwner, rangeStart, rangeEnd, aggregates, replayed, skipped)
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
func (c *rawMetricConverter) commitReplay(requestID uint64, leaseOwner string, rangeStart, rangeEnd time.Time, aggregates map[string]*hourlyAggregate, replayed, skipped int) error {
	tx := c.db.Begin()
	request := &models.OtelReplayRequest{}
	if err := tx.First(request,
		dal.Where("id = ? AND status = ? AND lease_owner = ? AND lease_until > ?", requestID, models.OtelReplayRequestStatusProcessing, leaseOwner, c.now().UTC()),
		dal.Lock(true, false),
	); err != nil {
		c.rollback(tx)
		if tx.IsErrorNotFound(err) {
			return errReplayLeaseLost
		}
		return fmt.Errorf("verify replay request lease before commit: %w", err)
	}
	if err := c.replaceReplayRange(tx, rangeStart, rangeEnd, aggregates); err != nil {
		c.rollback(tx)
		return err
	}
	if err := tx.UpdateColumns(&models.OtelReplayRequest{}, []dal.DalSet{
		{ColumnName: "status", Value: models.OtelReplayRequestStatusCompleted},
		{ColumnName: "lease_owner", Value: nil},
		{ColumnName: "lease_until", Value: nil},
		{ColumnName: "replayed_batches", Value: replayed},
		{ColumnName: "skipped_batches", Value: skipped},
		{ColumnName: "error_message", Value: nil},
		{ColumnName: "completed_at", Value: c.now().UTC()},
	}, dal.Where("id = ? AND status = ? AND lease_owner = ?", requestID, models.OtelReplayRequestStatusProcessing, leaseOwner)); err != nil {
		c.rollback(tx)
		return fmt.Errorf("complete Claude Code OTel replay request: %w", err)
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
