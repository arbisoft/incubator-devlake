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
)

const (
	// converterLeaseName is stored in the lease rows. It keeps its historical name, which
	// predates log batches, so replicas on either side of an upgrade share one lease.
	converterLeaseName          = "raw_metric_converter"
	converterLeaseDuration      = 30 * time.Second
	converterPollInterval       = 2 * time.Second
	converterMaxBackoffExponent = 8
	// converterMaxAttempts bounds retries of one batch to roughly 21 minutes, after which
	// it is quarantined so a persistent failure cannot block the ordered queue forever.
	converterMaxAttempts = 12
)

var nonterminalBatchStatuses = []string{
	models.OtelBatchStatusPending,
	models.OtelBatchStatusProcessing,
	models.OtelBatchStatusRetryableError,
}

type rawConverter struct {
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

var drainConverter *rawConverter

// StartConverter starts the background raw batch converter.
func StartConverter() {
	startRawConverter(db, logger)
}

// DrainConverter converts until idle under the given clock; DB tests use it in place of the background loop.
func DrainConverter(now func() time.Time) errors.Error {
	if drainConverter == nil {
		drainConverter = newRawConverter(db, logger)
	}
	drainConverter.now = now
	leader, err := drainConverter.acquireLease()
	if err != nil {
		return err
	}
	if !leader {
		return errors.Default.New("Claude Code OTel converter lease is held by another worker")
	}
	for {
		processed, err := drainConverter.pollOnce()
		if err != nil || !processed {
			return err
		}
	}
}

func newRawConverter(db dal.Dal, logger log.Logger) *rawConverter {
	return &rawConverter{db: db, logger: logger, now: time.Now, workerID: uuid.NewString()}
}

// startRawConverter starts this process's converter loop, which converts raw metric and
// log batches. Every Lake replica polls, but only the holder of the database-backed
// converter lease converts batches.
func startRawConverter(database dal.Dal, logger log.Logger) {
	if database == nil {
		return
	}
	converterStartOnce.Do(func() {
		converter := newRawConverter(database, logger)
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
func (c *rawConverter) poll() {
	c.pollUntilIdle(c.pollOnce)
}

// pollUntilIdle repeats pollOnce while it makes progress. An error ends the run only when
// nothing advanced: one queue failing must not hold back the other's backlog. A batch
// whose failure could not be recorded keeps its lease, so a failing queue reports no
// progress on the next round instead of spinning.
func (c *rawConverter) pollUntilIdle(pollOnce func() (bool, errors.Error)) {
	for {
		processed, err := pollOnce()
		if err == nil {
			c.pollErrorLogged = false
		} else if !c.pollErrorLogged {
			c.logWarn(err, "Claude Code OTel raw batch converter poll failed")
			c.pollErrorLogged = true
		}
		if !processed {
			return
		}
	}
}

func (c *rawConverter) pollOnce() (bool, errors.Error) {
	leader, err := c.acquireLease()
	if err != nil || !leader {
		return false, err
	}
	if err := c.runRetention(); err != nil {
		c.logWarn(err, "Claude Code OTel raw metric retention failed; conversion will continue")
	}
	return convertRound(c.processNextReplay, c.processNext, c.processNextLogBatch)
}

// convertRound runs one round of replay and live conversion. A completed replay request
// ends the round, so queued requests run before live conversion resumes. A replay failure
// does not: metrics and logs still advance, one batch each so neither backlog starves the
// other, and the replay error is reported with theirs. A request whose result could not be
// recorded keeps its lease, so the next round does not claim it again.
func convertRound(replay func() (bool, errors.Error), queues ...func() (bool, errors.Error)) (bool, errors.Error) {
	replayed, replayErr := replay()
	if replayed && replayErr == nil {
		return true, nil
	}
	replayStep := func() (bool, errors.Error) { return replayed, replayErr }
	return advanceQueues(append([]func() (bool, errors.Error){replayStep}, queues...)...)
}

// advanceQueues runs every queue step, even after one fails, so a failing queue cannot
// stop the others. It reports whether any step advanced, and the steps' errors combined.
func advanceQueues(steps ...func() (bool, errors.Error)) (bool, errors.Error) {
	advanced := false
	var failures []error
	var failure errors.Error
	for _, step := range steps {
		processed, err := step()
		advanced = advanced || processed
		if err != nil {
			failures = append(failures, err)
			failure = err
		}
	}
	if len(failures) > 1 {
		failure = errors.Default.Combine(failures)
	}
	return advanced, failure
}

// acquireLease takes or renews the singleton converter lease. The conditional update
// succeeds only for the current owner or after the previous owner's lease expired.
func (c *rawConverter) acquireLease() (bool, errors.Error) {
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
func (c *rawConverter) processNext() (bool, errors.Error) {
	batch, lease, err := c.claimNext()
	if err != nil || batch == nil {
		return false, err
	}
	prepared, conversionErr := c.convert(batch, lease)
	if conversionErr != nil {
		return true, c.recordBatchFailure(lease, conversionErr)
	}
	c.logConverted(batch, prepared)
	return true, nil
}

// claimNext claims the earliest nonterminal metric batch; see claimNextBatch.
func (c *rawConverter) claimNext() (*models.OtelMetricBatch, *batchLease, errors.Error) {
	batch := &models.OtelMetricBatch{}
	lease, err := c.claimNextBatch(batch, &models.OtelMetricBatch{}, nonterminalBatchStatuses)
	if err != nil || lease == nil {
		return nil, nil, err
	}
	return batch, lease, nil
}

// convert prepares facts outside a transaction, then verifies the batch lease and commits
// facts, series state, canonical rows, and raw completion atomically.
func (c *rawConverter) convert(batch *models.OtelMetricBatch, lease *batchLease) (*preparedBatch, error) {
	request, decodeErr := decodeOtelMetricBatchRequest(batch)
	if decodeErr != nil {
		return nil, &conversionError{code: errorInvalidPayload, permanent: true, err: fmt.Errorf("decode raw OTLP payload: %w", decodeErr)}
	}
	prepared, err := c.prepareUpdates(request)
	if err != nil {
		return nil, err
	}
	err = c.commitInLease(lease, prepared, func(tx dal.Transaction) error {
		if err := c.applyHourlyUpdates(tx, prepared.updates); err != nil {
			return err
		}
		if err := reconcileOtelDaily(tx, dailyTargets(prepared.updates)); err != nil {
			return classifyStorageError(fmt.Errorf("write canonical daily Claude Code OTel facts: %w", err))
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return prepared, nil
}

func (c *rawConverter) logConverted(batch *models.OtelMetricBatch, prepared *preparedBatch) {
	if c.logger == nil {
		return
	}
	if prepared.skipped[skippedResource] > 0 {
		c.logger.Warn(nil, "Claude Code OTel raw batch %d skipped %d resource group(s)", batch.ID, prepared.skipped[skippedResource])
	}
	if len(prepared.unknownMetrics) > 0 {
		c.logger.Info("Claude Code OTel raw batch %d ignored unmapped metrics: %s", batch.ID, strings.Join(prepared.unknownMetrics, ", "))
	}
}

func (c *rawConverter) logWarn(err error, message string) {
	if c.logger != nil {
		c.logger.Warn(err, "%s", message)
	}
}

// rollback is best-effort cleanup after a failed transaction step; the caller returns the
// primary failure.
func (c *rawConverter) rollback(tx dal.Transaction) {
	if err := tx.Rollback(); err != nil {
		c.logWarn(err, "failed to roll back Claude Code OTel converter transaction")
	}
}
