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
	metricsv1 "go.opentelemetry.io/proto/otlp/metrics/v1"
)

const (
	replayMaxRange              = 31 * 24 * time.Hour
	replayBatchPage             = 100
	replayDiagnosticSampleLimit = 3
	replayErrorMessageLimit     = 1024
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
		message := boundedReplayErrorMessage(replayErr)
		return true, c.finishReplay(request.ID, leaseOwner, models.OtelReplayRequestStatusFailed, replayed, skipped, message)
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

// renewReplayLease renews the replay request's own row lease and, just as importantly,
// re-verifies this worker still holds the converter's singleton global lease. A replay's
// request-row lease and the global converter lease used to be independent: a replay running
// longer than converterLeaseDuration kept its own lease fresh indefinitely while the global
// lease silently expired underneath it, letting another replica take over global leadership
// and start live-converting the same date range while the original replay was still running.
// Requiring both here makes a replay abort as soon as leadership actually changes, instead of
// only failing (or, before this fix, not failing at all) once it reaches commitReplay.
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
	leader, err := c.acquireLease()
	if err != nil {
		return fmt.Errorf("renew converter lease during replay: %w", err)
	}
	if !leader {
		return errReplayLeaseLost
	}
	return nil
}

// renewReplayLeaseIfDue avoids a request/global lease round trip for every raw batch while
// still renewing often enough for a long replay. force is used immediately before a day commit.
func (c *rawMetricConverter) renewReplayLeaseIfDue(requestID uint64, leaseOwner string, lastRenewal *time.Time, force bool) error {
	now := c.now().UTC()
	if !force && !lastRenewal.IsZero() && now.Sub(*lastRenewal) < converterLeaseDuration/3 {
		return nil
	}
	if err := c.renewReplayLease(requestID, leaseOwner); err != nil {
		return err
	}
	*lastRenewal = now
	return nil
}

// verifyConverterLease re-checks, inside the caller's already-open transaction, that this
// worker still holds the singleton converter lease, and holds a row lock on it until that
// transaction commits or rolls back. A replay's own request-row lease can outlive the global
// lease that originally elected this worker; without this, a replica that lost global
// leadership mid-replay could still commit a delete-and-replace of the range after a new
// leader had already written live facts into it. Locking the row (rather than only reading
// it) also blocks a concurrent acquireLease() from taking over for the short window this
// transaction is writing, so the two can never interleave.
func (c *rawMetricConverter) verifyConverterLease(tx dal.Transaction) error {
	lease := &models.OtelConverterLease{}
	if err := tx.First(lease, dal.Where("name = ?", converterLeaseName), dal.Lock(true, false)); err != nil {
		return fmt.Errorf("verify Claude Code OTel converter lease before replay commit: %w", err)
	}
	if lease.Owner != c.workerID || !lease.LeaseUntil.After(c.now().UTC()) {
		return errReplayLeaseLost
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

// replay rebuilds one completed UTC day at a time. Every completed day is independently
// replace-idempotent; a later failure leaves earlier days correct and a rerun replaces them.
// Persisted live series state is intentionally left untouched because replay accepts DELTA only.
func (c *rawMetricConverter) replay(request *models.OtelReplayRequest, leaseOwner string) (int, int, error) {
	if err := c.validateReplayRange(request); err != nil {
		return 0, 0, err
	}
	replayed, skipped := 0, 0
	diagnostics := replayDiagnostics{}
	var lastRenewal time.Time
	for dayStart := request.RangeStart.UTC(); dayStart.Before(request.RangeEnd.UTC()); dayStart = dayStart.AddDate(0, 0, 1) {
		dayReplayed, daySkipped, aggregates, err := c.prepareReplayDay(request.ID, leaseOwner, dayStart, &lastRenewal, &diagnostics)
		if err != nil {
			return replayed, skipped, err
		}
		if err := c.renewReplayLeaseIfDue(request.ID, leaseOwner, &lastRenewal, true); err != nil {
			return replayed, skipped, err
		}
		if err := c.commitReplayDay(request.ID, leaseOwner, dayStart, aggregates, replayed+dayReplayed, skipped+daySkipped, diagnostics.message()); err != nil {
			return replayed, skipped, err
		}
		replayed += dayReplayed
		skipped += daySkipped
	}
	return replayed, skipped, c.finishReplay(request.ID, leaseOwner, models.OtelReplayRequestStatusCompleted, replayed, skipped, diagnostics.message())
}

type replayDiagnostics struct {
	samples []string
}

const replayDiagnosticDetailLimit = 120

func (d *replayDiagnostics) add(batchID uint64, err error) {
	if len(d.samples) >= replayDiagnosticSampleLimit {
		return
	}
	code, _, message := classifyConversionError(err)
	d.samples = append(d.samples, fmt.Sprintf("batch=%d code=%s reason=%s detail=%s",
		batchID, code, replayDiagnosticReason(code), truncate(message, replayDiagnosticDetailLimit)))
}

// truncate bounds a diagnostic detail string to at most n runes so replay diagnostics
// stay short and predictable regardless of how long an underlying error message is.
func truncate(s string, n int) string {
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n])
}

func (d *replayDiagnostics) message() *string {
	if len(d.samples) == 0 {
		return nil
	}
	message := fmt.Sprintf("permanent replay skips: %v", d.samples)
	return &message
}

func replayDiagnosticReason(code conversionErrorCode) string {
	switch code {
	case errorInvalidPayload:
		return "stored payload could not be decoded"
	case errorUnsupportedTemporality:
		return "stored payload cannot be replayed safely"
	default:
		return "batch was permanently quarantined"
	}
}

func boundedReplayErrorMessage(err error) *string {
	code, _, message := classifyConversionError(err)
	message = fmt.Sprintf("%s: %s", code, message)
	if len(message) > replayErrorMessageLimit {
		message = message[:replayErrorMessageLimit]
	}
	return &message
}

// prepareReplayDay fully prepares one day before any existing fact for that day is removed.
func (c *rawMetricConverter) prepareReplayDay(requestID uint64, leaseOwner string, dayStart time.Time, lastRenewal *time.Time, diagnostics *replayDiagnostics) (int, int, map[string]*hourlyAggregate, error) {
	dayEnd := dayStart.AddDate(0, 0, 1)
	aggregates := make(map[string]*hourlyAggregate)
	replayed, skipped := 0, 0
	var lastBatchID uint64
	for {
		if err := c.renewReplayLeaseIfDue(requestID, leaseOwner, lastRenewal, false); err != nil {
			return replayed, skipped, nil, err
		}
		batches := make([]*models.OtelMetricBatch, 0, replayBatchPage)
		if err := c.db.All(&batches,
			dal.Where("id > ? AND status IN ? AND max_observed_at >= ? AND min_observed_at < ?", lastBatchID, replayableBatchStatuses, dayStart, dayEnd),
			dal.Orderby("id ASC"),
			dal.Limit(replayBatchPage),
		); err != nil {
			return replayed, skipped, nil, fmt.Errorf("load raw batches for replay: %w", err)
		}
		for _, batch := range batches {
			lastBatchID = batch.ID
			prepared, skipErr, err := c.replayBatch(batch, dayStart, dayEnd, aggregates)
			if err != nil {
				return replayed, skipped, nil, err
			}
			if skipErr != nil {
				diagnostics.add(batch.ID, skipErr)
				skipped++
				continue
			}
			if prepared {
				replayed++
			}
		}
		if len(batches) < replayBatchPage {
			return replayed, skipped, aggregates, nil
		}
	}
}

// replayBatch adds one raw batch's DELTA increases to one day's aggregates. A permanently
// quarantined raw batch never contributed facts and can be skipped; every failure for a
// processed batch aborts before the caller deletes its existing day.
func (c *rawMetricConverter) replayBatch(batch *models.OtelMetricBatch, rangeStart, rangeEnd time.Time, aggregates map[string]*hourlyAggregate) (bool, error, error) {
	request, decodeErr := decodeOtelMetricBatchRequest(batch)
	if decodeErr != nil {
		return c.replayBatchFailure(batch, permanentMetricError(errorInvalidPayload, "decode replay batch %d: %v", batch.ID, decodeErr))
	}
	prepared, err := c.prepareUpdates(request)
	if err != nil {
		_, permanent, _ := classifyConversionError(err)
		if permanent {
			return c.replayBatchFailure(batch, err)
		}
		return false, nil, fmt.Errorf("prepare replay batch %d: %w", batch.ID, err)
	}
	// Validate the full batch before mutating aggregates. A mixed Delta/Cumulative batch
	// cannot be replayed safely without predecessor state, and must leave the day untouched.
	for _, update := range prepared.updates {
		if update.temporality == metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_CUMULATIVE {
			return c.replayBatchFailure(batch, permanentMetricError(errorUnsupportedTemporality, "replay batch %d contains cumulative telemetry; a predecessor checkpoint is required", batch.ID))
		}
	}
	for _, update := range prepared.updates {
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
	return true, nil, nil
}

func (c *rawMetricConverter) replayBatchFailure(batch *models.OtelMetricBatch, err error) (bool, error, error) {
	if batch.Status == models.OtelMetricBatchStatusPermanentError {
		return false, err, nil
	}
	return false, nil, fmt.Errorf("cannot safely replay processed batch %d: %w", batch.ID, err)
}

func hourlyAggregateKey(update factUpdate) string {
	return fmt.Sprintf("%d\x00%d\x00%s\x00%d\x00%s\x00%s\x00%s\x00%s\x00%s",
		update.fact, update.connection.ID, update.identity.key, update.hour.Unix(), update.model, update.query, update.tool, update.language, update.column)
}

// commitReplayDay fences both leases and replaces one completed UTC day atomically. The
// request stays processing until all requested days have committed successfully.
func (c *rawMetricConverter) commitReplayDay(requestID uint64, leaseOwner string, dayStart time.Time, aggregates map[string]*hourlyAggregate, replayed, skipped int, diagnostic *string) error {
	dayEnd := dayStart.AddDate(0, 0, 1)
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
	if err := c.verifyConverterLease(tx); err != nil {
		c.rollback(tx)
		return err
	}
	if err := c.replaceReplayRange(tx, dayStart, dayEnd, aggregates); err != nil {
		c.rollback(tx)
		return err
	}
	if err := tx.UpdateColumns(&models.OtelReplayRequest{}, []dal.DalSet{
		{ColumnName: "replayed_batches", Value: replayed},
		{ColumnName: "skipped_batches", Value: skipped},
		{ColumnName: "error_message", Value: diagnostic},
	}, dal.Where("id = ? AND status = ? AND lease_owner = ?", requestID, models.OtelReplayRequestStatusProcessing, leaseOwner)); err != nil {
		c.rollback(tx)
		return fmt.Errorf("record Claude Code OTel replay day: %w", err)
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
