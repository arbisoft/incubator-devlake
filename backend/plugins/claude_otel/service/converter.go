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
	converterLeaseName          = "raw_metric_converter"
	converterLeaseDuration      = 30 * time.Second
	converterPollInterval       = 2 * time.Second
	converterMaxBackoffExponent = 8
	// converterMaxAttempts bounds retries of one batch to roughly 21 minutes, after which
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
		c.logWarn(err, "Claude Code OTel raw metric retention failed; conversion will continue")
	}
	if replayed, err := c.processNextReplay(); err != nil || replayed {
		return replayed, err
	}
	// Metrics and logs advance one batch each per round so neither backlog starves the other.
	processedMetrics, err := c.processNext()
	if err != nil {
		return processedMetrics, err
	}
	processedLogs, err := c.processNextLogBatch()
	return processedMetrics || processedLogs, err
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
		return true, c.recordBatchFailure(&models.OtelMetricBatch{}, batch.ID, batch.AttemptCount, leaseOwner, conversionErr)
	}
	c.logConverted(batch, prepared)
	return true, nil
}

// claimNext claims the earliest nonterminal metric batch; see claimNextBatch.
func (c *rawMetricConverter) claimNext() (*models.OtelMetricBatch, string, errors.Error) {
	batch := &models.OtelMetricBatch{}
	leaseOwner, err := c.claimNextBatch(batch)
	if err != nil || leaseOwner == "" {
		return nil, "", err
	}
	return batch, leaseOwner, nil
}

// convert prepares facts outside a transaction, then verifies the batch lease and commits
// facts, series state, canonical rows, and raw completion atomically.
func (c *rawMetricConverter) convert(batch *models.OtelMetricBatch, leaseOwner string) (*preparedBatch, error) {
	request, decodeErr := decodeOtelMetricBatchRequest(batch)
	if decodeErr != nil {
		return nil, &conversionError{code: errorInvalidPayload, permanent: true, err: fmt.Errorf("decode raw OTLP payload: %w", decodeErr)}
	}
	prepared, err := c.prepareUpdates(request)
	if err != nil {
		return nil, err
	}
	err = c.commitInLease(&models.OtelMetricBatch{}, batch.ID, leaseOwner, prepared, func(tx dal.Transaction) error {
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
