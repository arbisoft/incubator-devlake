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
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/google/uuid"
)

// The raw metric and log batch tables share one status, lease and attempt lifecycle, so
// both queues run on the helpers below, given the table as a dal.Tabler.

// rawBatchHead holds the columns that decide whether a queue head can be claimed.
type rawBatchHead struct {
	ID            uint64
	Status        string
	AttemptCount  int
	NextAttemptAt *time.Time
	LeaseUntil    *time.Time
	ReceivedAt    time.Time
}

// rawBatchLabel names a raw batch table in log and error messages.
func rawBatchLabel(table dal.Tabler) string {
	if _, isLogBatch := table.(*models.OtelLogBatch); isLogBatch {
		return "raw log batch"
	}
	return "raw batch"
}

// claimNextBatch claims only the earliest nonterminal batch of batch's table and loads it
// into batch, a new empty metric or log batch. A later batch never overtakes a batch that
// is waiting for retry or held by another lease, because cumulative series state and
// session event order depend on receipt order. It returns the lease owner, or "" when
// nothing was claimed.
func (c *rawConverter) claimNextBatch(batch dal.Tabler) (string, errors.Error) {
	head, err := c.claimHead(batch)
	if err != nil || head == nil {
		return "", err
	}
	if !isBatchClaimable(head.Status, head.LeaseUntil, head.NextAttemptAt, c.now().UTC()) {
		return "", nil
	}
	return c.claimBatch(batch, head)
}

// claimHead finds the earliest nonterminal batch across all nonterminalBatchStatuses by
// querying once per status rather than a single WHERE status IN (...) ORDER BY received_at
// query. MySQL cannot use a (status, received_at) claim index such as
// idx_otel_metric_batch_claim or idx_otel_log_batch_claim to satisfy that ORDER BY once the
// IN-list has more than one value, because a composite index only orders received_at within
// one status value at a time. Depending on table statistics, the optimizer may instead scan
// the plain received_at index in full, filtering by status row-by-row; once the table holds
// a large processed history and the queue head is a contiguous recent block (for example,
// after the converter was down for a while), that degrades to scanning every
// already-processed row ahead of the first match, on every poll. Querying per status keeps
// each query to a single-value index lookup, which MySQL always satisfies with the
// composite index.
func (c *rawConverter) claimHead(table dal.Tabler) (*rawBatchHead, errors.Error) {
	var head *rawBatchHead
	for _, status := range nonterminalBatchStatuses {
		candidate := &rawBatchHead{}
		err := c.db.First(candidate,
			dal.From(table),
			dal.Select("id, status, attempt_count, next_attempt_at, lease_until, received_at"),
			dal.Where("status = ?", status),
			dal.Orderby("received_at ASC, id ASC"),
		)
		if err != nil {
			if c.db.IsErrorNotFound(err) {
				continue
			}
			return nil, errors.Default.Wrap(err, fmt.Sprintf("failed to find the next Claude Code OTel %s", rawBatchLabel(table)))
		}
		if head == nil || candidate.ReceivedAt.Before(head.ReceivedAt) ||
			(candidate.ReceivedAt.Equal(head.ReceivedAt) && candidate.ID < head.ID) {
			head = candidate
		}
	}
	return head, nil
}

// claimBatch leases head unless another worker changed it first, then loads the claimed
// row into batch. It returns the lease owner, or "" when the claim was lost.
func (c *rawConverter) claimBatch(batch dal.Tabler, head *rawBatchHead) (string, errors.Error) {
	label := rawBatchLabel(batch)
	leaseOwner := uuid.NewString()
	if err := c.db.UpdateColumns(
		batch,
		[]dal.DalSet{
			{ColumnName: "status", Value: models.OtelBatchStatusProcessing},
			{ColumnName: "lease_owner", Value: leaseOwner},
			{ColumnName: "lease_until", Value: c.now().UTC().Add(converterLeaseDuration)},
			{ColumnName: "next_attempt_at", Value: nil},
			{ColumnName: "attempt_count", Value: head.AttemptCount + 1},
		},
		dal.Where("id = ? AND status = ? AND attempt_count = ?", head.ID, head.Status, head.AttemptCount),
	); err != nil {
		return "", errors.Default.Wrap(err, fmt.Sprintf("failed to claim Claude Code OTel %s", label))
	}
	if err := c.db.First(batch, dal.Where("id = ? AND lease_owner = ?", head.ID, leaseOwner)); err != nil {
		if c.db.IsErrorNotFound(err) {
			return "", nil
		}
		return "", errors.Default.Wrap(err, fmt.Sprintf("failed to load claimed Claude Code OTel %s", label))
	}
	return leaseOwner, nil
}

// isBatchClaimable applies to metric and log batches, which share the status lifecycle.
func isBatchClaimable(status string, leaseUntil, nextAttemptAt *time.Time, now time.Time) bool {
	switch status {
	case models.OtelBatchStatusProcessing:
		return leaseUntil == nil || leaseUntil.Before(now)
	case models.OtelBatchStatusRetryableError:
		return nextAttemptAt == nil || !nextAttemptAt.After(now)
	default:
		return true
	}
}

// commitInLease verifies the batch lease under lock, runs apply and marks the batch
// processed in one transaction. table is a new empty batch of the batch's table; diag
// carries the skip diagnostics recorded on the processed batch.
func (c *rawConverter) commitInLease(table dal.Tabler, id uint64, leaseOwner string, diag *preparedBatch, apply func(dal.Transaction) error) error {
	label := rawBatchLabel(table)
	tx := c.db.Begin()
	if err := tx.First(table,
		dal.Select("id"),
		dal.Where("id = ? AND status = ? AND lease_owner = ? AND lease_until > ?", id, models.OtelBatchStatusProcessing, leaseOwner, c.now().UTC()),
		dal.Lock(true, false),
	); err != nil {
		c.rollback(tx)
		return &conversionError{code: errorLeaseLost, err: fmt.Errorf("verify %s lease: %w", label, err)}
	}
	if err := apply(tx); err != nil {
		c.rollback(tx)
		return err
	}
	if err := tx.UpdateColumns(
		table,
		[]dal.DalSet{
			{ColumnName: "status", Value: models.OtelBatchStatusProcessed},
			{ColumnName: "lease_owner", Value: nil},
			{ColumnName: "lease_until", Value: nil},
			{ColumnName: "processing_error_code", Value: diag.diagnosticCode()},
			{ColumnName: "processing_error_message", Value: diag.diagnostic()},
			{ColumnName: "processed_at", Value: c.now().UTC()},
		},
		dal.Where("id = ? AND status = ? AND lease_owner = ?", id, models.OtelBatchStatusProcessing, leaseOwner),
	); err != nil {
		c.rollback(tx)
		return classifyStorageError(fmt.Errorf("mark %s processed: %w", label, err))
	}
	if err := tx.Commit(); err != nil {
		return &conversionError{code: errorStorageFailure, err: fmt.Errorf("commit Claude Code OTel %s conversion: %w", label, err)}
	}
	return nil
}

// recordBatchFailure releases the batch lease with a classified retry or quarantine state.
// A failure to persist that state is returned; lease expiry keeps the batch reclaimable.
func (c *rawConverter) recordBatchFailure(table dal.Tabler, id uint64, attempts int, leaseOwner string, conversionErr error) errors.Error {
	label := rawBatchLabel(table)
	code, permanent, message := classifyConversionError(conversionErr)
	now := c.now().UTC()
	if code == errorLeaseLost {
		c.logWarn(conversionErr, fmt.Sprintf("Claude Code OTel %s %d lease was lost", label, id))
		return nil
	}
	if !permanent && attempts >= converterMaxAttempts {
		message = fmt.Sprintf("%s after %d attempts: %s", code, attempts, message)
		code, permanent = errorRetryExhausted, true
	}
	sets := []dal.DalSet{
		{ColumnName: "lease_owner", Value: nil},
		{ColumnName: "lease_until", Value: nil},
		{ColumnName: "processing_error_code", Value: string(code)},
		{ColumnName: "processing_error_message", Value: message},
	}
	if permanent {
		sets = append(sets,
			dal.DalSet{ColumnName: "status", Value: models.OtelBatchStatusPermanentError},
			dal.DalSet{ColumnName: "processed_at", Value: now},
		)
	} else {
		sets = append(sets,
			dal.DalSet{ColumnName: "status", Value: models.OtelBatchStatusRetryableError},
			dal.DalSet{ColumnName: "next_attempt_at", Value: now.Add(converterBackoff(attempts))},
		)
	}
	if err := c.db.UpdateColumns(table, sets,
		dal.Where("id = ? AND status = ? AND lease_owner = ?", id, models.OtelBatchStatusProcessing, leaseOwner),
	); err != nil {
		return errors.Default.Wrap(err, fmt.Sprintf("failed to record Claude Code OTel %s %d failure", label, id))
	}
	c.logWarn(nil, fmt.Sprintf("Claude Code OTel %s %d conversion failed: code=%s permanent=%t attempt=%d", label, id, code, permanent, attempts))
	return nil
}

func converterBackoff(attempt int) time.Duration {
	if attempt > converterMaxBackoffExponent {
		attempt = converterMaxBackoffExponent
	}
	return time.Second * time.Duration(1<<uint(attempt))
}
