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
	"strings"
	"sync"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/log"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/google/uuid"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	"google.golang.org/protobuf/proto"
)

const (
	converterLeaseName          = "raw_metric_converter"
	converterLeaseDuration      = 30 * time.Second
	converterPollInterval       = 2 * time.Second
	converterMaxBackoffExponent = 8
	// converterMaxAttempts bounds retries of one batch to roughly 40 minutes, after which
	// it is quarantined so a persistent failure cannot block the ordered queue forever.
	converterMaxAttempts = 12
)

var nonterminalBatchStatuses = []string{
	models.OtelMetricBatchStatusPending,
	models.OtelMetricBatchStatusProcessing,
	models.OtelMetricBatchStatusRetryableError,
}

type rawMetricConverter struct {
	db       dal.Dal
	logger   log.Logger
	now      func() time.Time
	workerID string
	// nextRetentionAt schedules raw retention; it is process-local because only the lease
	// holder runs it and a new leader may safely run it immediately.
	nextRetentionAt time.Time
	// pollErrorLogged suppresses repeated poll failures, such as an unmigrated database
	// during startup, until a poll succeeds again.
	pollErrorLogged bool
}

var converterStartOnce sync.Once

func newRawMetricConverter(db dal.Dal, logger log.Logger) *rawMetricConverter {
	return &rawMetricConverter{db: db, logger: logger, now: time.Now, workerID: uuid.NewString()}
}

// startRawMetricConverter starts this process's converter loop. Every Lake replica polls,
// but only the holder of the database-backed converter lease converts batches.
func startRawMetricConverter(database dal.Dal, logger log.Logger) {
	if database == nil {
		return
	}
	converterStartOnce.Do(func() {
		converter := newRawMetricConverter(database, logger)
		go func() {
			ticker := time.NewTicker(converterPollInterval)
			defer ticker.Stop()
			for range ticker.C {
				converter.poll()
			}
		}()
	})
}

// poll runs retention, replay requests, and raw conversion in receipt order while this
// process holds the converter lease.
func (c *rawMetricConverter) poll() {
	for {
		processed, err := c.pollOnce()
		if err != nil {
			if !c.pollErrorLogged {
				c.logWarn(err, "Claude Code OTel raw metric converter poll failed")
				c.pollErrorLogged = true
			}
			return
		}
		c.pollErrorLogged = false
		if !processed {
			return
		}
	}
}

func (c *rawMetricConverter) pollOnce() (bool, errors.Error) {
	leader, err := c.acquireLease()
	if err != nil || !leader {
		return false, err
	}
	if err := c.runRetention(); err != nil {
		return false, err
	}
	if replayed, err := c.processNextReplay(); err != nil || replayed {
		return replayed, err
	}
	return c.processNext()
}

// acquireLease takes or renews the singleton converter lease. The conditional update
// succeeds only for the current owner or after the previous owner's lease expired.
func (c *rawMetricConverter) acquireLease() (bool, errors.Error) {
	now := c.now().UTC()
	leaseUntil := now.Add(converterLeaseDuration)
	tx := c.db.Begin()
	lease := &models.OtelConverterLease{Name: converterLeaseName, Owner: c.workerID, LeaseUntil: leaseUntil, UpdatedAt: now}
	if err := tx.CreateIfNotExist(lease); err != nil {
		c.rollback(tx)
		return false, errors.Default.Wrap(err, "failed to create Claude Code OTel converter lease")
	}
	if err := tx.UpdateColumns(
		&models.OtelConverterLease{},
		[]dal.DalSet{
			{ColumnName: "owner", Value: c.workerID},
			{ColumnName: "lease_until", Value: leaseUntil},
			{ColumnName: "updated_at", Value: now},
		},
		dal.Where("name = ? AND (owner = ? OR lease_until < ?)", converterLeaseName, c.workerID, now),
	); err != nil {
		c.rollback(tx)
		return false, errors.Default.Wrap(err, "failed to renew Claude Code OTel converter lease")
	}
	current := &models.OtelConverterLease{}
	if err := tx.First(current, dal.Where("name = ?", converterLeaseName), dal.Lock(true, false)); err != nil {
		c.rollback(tx)
		return false, errors.Default.Wrap(err, "failed to verify Claude Code OTel converter lease")
	}
	if err := tx.Commit(); err != nil {
		return false, errors.Default.Wrap(err, "failed to commit Claude Code OTel converter lease")
	}
	return current.Owner == c.workerID, nil
}

// processNext claims and converts the head of the raw queue. It returns true when a batch
// reached a new state, including retry scheduling or quarantine.
func (c *rawMetricConverter) processNext() (bool, errors.Error) {
	batch, leaseOwner, err := c.claimNext()
	if err != nil || batch == nil {
		return false, err
	}
	prepared, conversionErr := c.convert(batch, leaseOwner)
	if conversionErr != nil {
		return true, c.recordFailure(batch, leaseOwner, conversionErr)
	}
	c.logConverted(batch, prepared)
	return true, nil
}

// claimNext claims only the earliest nonterminal batch. A later batch never overtakes a
// batch that is waiting for retry or held by another lease, because cumulative series
// state depends on receipt order.
func (c *rawMetricConverter) claimNext() (*models.OtelMetricBatch, string, errors.Error) {
	now := c.now().UTC()
	head := &models.OtelMetricBatch{}
	err := c.db.First(head,
		dal.Select("id, status, attempt_count, next_attempt_at, lease_until"),
		dal.Where("status IN ?", nonterminalBatchStatuses),
		dal.Orderby("id ASC"),
	)
	if err != nil {
		if c.db.IsErrorNotFound(err) {
			return nil, "", nil
		}
		return nil, "", errors.Default.Wrap(err, "failed to find the next Claude Code OTel raw batch")
	}
	if !isBatchClaimable(head, now) {
		return nil, "", nil
	}
	leaseOwner := uuid.NewString()
	if err := c.db.UpdateColumns(
		&models.OtelMetricBatch{},
		[]dal.DalSet{
			{ColumnName: "status", Value: models.OtelMetricBatchStatusProcessing},
			{ColumnName: "lease_owner", Value: leaseOwner},
			{ColumnName: "lease_until", Value: now.Add(converterLeaseDuration)},
			{ColumnName: "next_attempt_at", Value: nil},
			{ColumnName: "attempt_count", Value: head.AttemptCount + 1},
		},
		dal.Where("id = ? AND status = ? AND attempt_count = ?", head.ID, head.Status, head.AttemptCount),
	); err != nil {
		return nil, "", errors.Default.Wrap(err, "failed to claim Claude Code OTel raw batch")
	}
	batch := &models.OtelMetricBatch{}
	if err := c.db.First(batch, dal.Where("id = ? AND lease_owner = ?", head.ID, leaseOwner)); err != nil {
		if c.db.IsErrorNotFound(err) {
			return nil, "", nil
		}
		return nil, "", errors.Default.Wrap(err, "failed to load claimed Claude Code OTel raw batch")
	}
	return batch, leaseOwner, nil
}

func isBatchClaimable(batch *models.OtelMetricBatch, now time.Time) bool {
	switch batch.Status {
	case models.OtelMetricBatchStatusProcessing:
		return batch.LeaseUntil == nil || batch.LeaseUntil.Before(now)
	case models.OtelMetricBatchStatusRetryableError:
		return batch.NextAttemptAt == nil || !batch.NextAttemptAt.After(now)
	default:
		return true
	}
}

// convert prepares facts outside a transaction, then verifies the batch lease and commits
// facts, series state, canonical rows, and raw completion atomically.
func (c *rawMetricConverter) convert(batch *models.OtelMetricBatch, leaseOwner string) (*preparedBatch, error) {
	request := &collectormetrics.ExportMetricsServiceRequest{}
	if err := proto.Unmarshal(batch.PayloadProto, request); err != nil {
		return nil, &conversionError{code: errorInvalidPayload, permanent: true, err: fmt.Errorf("decode raw OTLP payload: %w", err)}
	}
	prepared, err := c.prepareUpdates(request)
	if err != nil {
		return nil, err
	}

	tx := c.db.Begin()
	claimedBatch := &models.OtelMetricBatch{}
	if err := tx.First(claimedBatch,
		dal.Select("id"),
		dal.Where("id = ? AND status = ? AND lease_owner = ? AND lease_until > ?", batch.ID, models.OtelMetricBatchStatusProcessing, leaseOwner, c.now().UTC()),
		dal.Lock(true, false),
	); err != nil {
		c.rollback(tx)
		return nil, &conversionError{code: errorLeaseLost, err: fmt.Errorf("verify raw batch lease: %w", err)}
	}
	if err := c.applyHourlyUpdates(tx, prepared.updates); err != nil {
		c.rollback(tx)
		return nil, err
	}
	if err := reconcileOtelDaily(tx, dailyTargets(prepared.updates)); err != nil {
		c.rollback(tx)
		return nil, classifyStorageError(fmt.Errorf("write canonical daily Claude Code OTel facts: %w", err))
	}
	if err := tx.UpdateColumns(
		&models.OtelMetricBatch{},
		[]dal.DalSet{
			{ColumnName: "status", Value: models.OtelMetricBatchStatusProcessed},
			{ColumnName: "lease_owner", Value: nil},
			{ColumnName: "lease_until", Value: nil},
			{ColumnName: "processing_error_code", Value: prepared.diagnosticCode()},
			{ColumnName: "processing_error_message", Value: prepared.diagnostic()},
			{ColumnName: "processed_at", Value: c.now().UTC()},
		},
		dal.Where("id = ? AND status = ? AND lease_owner = ?", batch.ID, models.OtelMetricBatchStatusProcessing, leaseOwner),
	); err != nil {
		c.rollback(tx)
		return nil, classifyStorageError(fmt.Errorf("mark raw batch processed: %w", err))
	}
	if err := tx.Commit(); err != nil {
		return nil, &conversionError{code: errorStorageFailure, err: fmt.Errorf("commit Claude Code OTel conversion: %w", err)}
	}
	return prepared, nil
}

// recordFailure releases the batch lease with a classified retry or quarantine state. A
// failure to persist that state is returned; lease expiry keeps the batch reclaimable.
func (c *rawMetricConverter) recordFailure(batch *models.OtelMetricBatch, leaseOwner string, conversionErr error) errors.Error {
	code, permanent, message := classifyConversionError(conversionErr)
	if code == errorLeaseLost {
		c.logWarn(conversionErr, fmt.Sprintf("Claude Code OTel raw batch %d lease was lost", batch.ID))
		return nil
	}
	if !permanent && batch.AttemptCount >= converterMaxAttempts {
		message = fmt.Sprintf("%s after %d attempts: %s", code, batch.AttemptCount, message)
		code, permanent = errorRetryExhausted, true
	}
	sets := []dal.DalSet{
		{ColumnName: "lease_owner", Value: nil},
		{ColumnName: "lease_until", Value: nil},
		{ColumnName: "processing_error_code", Value: string(code)},
		{ColumnName: "processing_error_message", Value: message},
	}
	if permanent {
		sets = append(sets, dal.DalSet{ColumnName: "status", Value: models.OtelMetricBatchStatusPermanentError})
	} else {
		sets = append(sets,
			dal.DalSet{ColumnName: "status", Value: models.OtelMetricBatchStatusRetryableError},
			dal.DalSet{ColumnName: "next_attempt_at", Value: c.now().UTC().Add(converterBackoff(batch.AttemptCount))},
		)
	}
	if err := c.db.UpdateColumns(&models.OtelMetricBatch{}, sets,
		dal.Where("id = ? AND status = ? AND lease_owner = ?", batch.ID, models.OtelMetricBatchStatusProcessing, leaseOwner),
	); err != nil {
		return errors.Default.Wrap(err, fmt.Sprintf("failed to record Claude Code OTel raw batch %d failure", batch.ID))
	}
	c.logWarn(nil, fmt.Sprintf("Claude Code OTel raw batch %d conversion failed: code=%s permanent=%t attempt=%d", batch.ID, code, permanent, batch.AttemptCount))
	return nil
}

func converterBackoff(attempt int) time.Duration {
	if attempt > converterMaxBackoffExponent {
		attempt = converterMaxBackoffExponent
	}
	return time.Second * time.Duration(1<<uint(attempt))
}

func (c *rawMetricConverter) logConverted(batch *models.OtelMetricBatch, prepared *preparedBatch) {
	if c.logger == nil {
		return
	}
	if prepared.skippedCount > 0 {
		c.logger.Warn(nil, "Claude Code OTel raw batch %d skipped %d resource group(s)", batch.ID, prepared.skippedCount)
	}
	if len(prepared.unknownMetrics) > 0 {
		c.logger.Info("Claude Code OTel raw batch %d ignored unmapped metrics: %s", batch.ID, strings.Join(prepared.unknownMetrics, ", "))
	}
}

func (c *rawMetricConverter) logWarn(err error, message string) {
	if c.logger != nil {
		c.logger.Warn(err, "%s", message)
	}
}

// rollback is best-effort cleanup after a failed transaction step; the caller returns the
// primary failure.
func (c *rawMetricConverter) rollback(tx dal.Transaction) {
	if err := tx.Rollback(); err != nil {
		c.logWarn(err, "failed to roll back Claude Code OTel converter transaction")
	}
}
