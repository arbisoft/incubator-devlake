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

// batchLease is one claimed raw batch: its table, row and attempt, and the lease owner
// this worker holds it under.
type batchLease struct {
	// table is a new empty batch of the batch's table, used to address its row.
	table    dal.Tabler
	id       uint64
	attempts int
	owner    string
}

// claimNextBatch claims only the earliest nonterminal batch of batch's table and loads it
// into batch, a new empty metric or log batch; table is another new empty batch of the same
// table, which the lease keeps to address the row. A later batch never overtakes a batch that
// is waiting for retry or held by another lease, because cumulative series state and
// session event order depend on receipt order. It returns nil when nothing was claimed.
func (c *rawConverter) claimNextBatch(batch dal.Tabler, table dal.Tabler) (*batchLease, errors.Error) {
	head, err := c.claimHead(table)
	if err != nil || head == nil {
		return nil, err
	}
	if !isBatchClaimable(head.Status, head.LeaseUntil, head.NextAttemptAt, c.now().UTC()) {
		return nil, nil
	}
	return c.claimBatch(batch, table, head)
}

// claimHeadQuery builds the derived table claimHead reads: a UNION ALL of one
// single-status lookup per nonterminalBatchStatuses entry.
//
// It is not a single WHERE status IN (...) ORDER BY received_at query. MySQL cannot use a
// (status, received_at) claim index such as idx_otel_metric_batch_claim or
// idx_otel_log_batch_claim to satisfy that ORDER BY once the IN-list has more than one
// value, because a composite index only orders received_at within one status value at a
// time. The optimizer may then scan the plain received_at index in full, filtering by status
// row by row; once the table holds a large processed history and the queue head is a recent
// block (for example, after the converter was down for a while), that degrades to scanning
// every processed row ahead of the first match, on every poll. Each branch of the union is a
// single-value index lookup with LIMIT 1, which MySQL always satisfies with the composite
// index, and the outer ORDER BY sorts at most one row per status.
func claimHeadQuery(table dal.Tabler) (string, []interface{}) {
	branches := make([]string, 0, len(nonterminalBatchStatuses))
	params := make([]interface{}, 0, len(nonterminalBatchStatuses))
	for _, status := range nonterminalBatchStatuses {
		branches = append(branches, "(SELECT id, status, attempt_count, next_attempt_at, lease_until, received_at FROM "+
			table.TableName()+" WHERE status = ? ORDER BY received_at ASC, id ASC LIMIT 1)")
		params = append(params, status)
	}
	return "(" + strings.Join(branches, " UNION ALL ") + ") AS claim_heads", params
}

// claimHead finds the earliest nonterminal batch of table in one query, or nil when the
// queue is empty.
func (c *rawConverter) claimHead(table dal.Tabler) (*rawBatchHead, errors.Error) {
	query, params := claimHeadQuery(table)
	heads := make([]*rawBatchHead, 0, 1)
	if err := c.db.All(&heads, dal.From(query, params...), dal.Orderby("received_at ASC, id ASC"), dal.Limit(1)); err != nil {
		return nil, errors.Default.Wrap(err, fmt.Sprintf("failed to find the next Claude Code OTel %s", rawBatchLabel(table)))
	}
	if len(heads) == 0 {
		return nil, nil
	}
	return heads[0], nil
}

// claimBatch leases head unless another worker changed it first, then loads the claimed
// row into batch. It returns nil when the claim was lost.
func (c *rawConverter) claimBatch(batch dal.Tabler, table dal.Tabler, head *rawBatchHead) (*batchLease, errors.Error) {
	label := rawBatchLabel(table)
	leaseOwner := uuid.NewString()
	if err := c.db.UpdateColumns(
		table,
		[]dal.DalSet{
			{ColumnName: "status", Value: models.OtelBatchStatusProcessing},
			{ColumnName: "lease_owner", Value: leaseOwner},
			{ColumnName: "lease_until", Value: c.now().UTC().Add(converterLeaseDuration)},
			{ColumnName: "next_attempt_at", Value: nil},
			{ColumnName: "attempt_count", Value: head.AttemptCount + 1},
		},
		dal.Where("id = ? AND status = ? AND attempt_count = ?", head.ID, head.Status, head.AttemptCount),
	); err != nil {
		return nil, errors.Default.Wrap(err, fmt.Sprintf("failed to claim Claude Code OTel %s", label))
	}
	if err := c.db.First(batch, dal.Where("id = ? AND lease_owner = ?", head.ID, leaseOwner)); err != nil {
		if c.db.IsErrorNotFound(err) {
			return nil, nil
		}
		return nil, errors.Default.Wrap(err, fmt.Sprintf("failed to load claimed Claude Code OTel %s", label))
	}
	return &batchLease{table: table, id: head.ID, attempts: head.AttemptCount + 1, owner: leaseOwner}, nil
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
// processed in one transaction. diag carries the skip diagnostics recorded on the
// processed batch.
func (c *rawConverter) commitInLease(lease *batchLease, diag *preparedBatch, apply func(dal.Transaction) error) error {
	label := rawBatchLabel(lease.table)
	tx := c.db.Begin()
	if err := tx.First(lease.table,
		dal.Select("id"),
		dal.Where("id = ? AND status = ? AND lease_owner = ? AND lease_until > ?", lease.id, models.OtelBatchStatusProcessing, lease.owner, c.now().UTC()),
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
		lease.table,
		[]dal.DalSet{
			{ColumnName: "status", Value: models.OtelBatchStatusProcessed},
			{ColumnName: "lease_owner", Value: nil},
			{ColumnName: "lease_until", Value: nil},
			{ColumnName: "processing_error_code", Value: diag.diagnosticCode()},
			{ColumnName: "processing_error_message", Value: diag.diagnostic()},
			{ColumnName: "processed_at", Value: c.now().UTC()},
		},
		dal.Where("id = ? AND status = ? AND lease_owner = ?", lease.id, models.OtelBatchStatusProcessing, lease.owner),
	); err != nil {
		c.rollback(tx)
		return classifyStorageError(fmt.Errorf("mark %s processed: %w", label, err))
	}
	if err := tx.Commit(); err != nil {
		return &conversionError{code: errorStorageFailure, err: fmt.Errorf("commit Claude Code OTel %s conversion: %w", label, err)}
	}
	return nil
}

// batchFailure is the state a failed batch moves to. A permanent failure quarantines the
// batch; any other failure schedules a retry, until converterMaxAttempts makes it permanent.
type batchFailure struct {
	code      conversionErrorCode
	permanent bool
	message   string
}

func newBatchFailure(conversionErr error, attempts int) batchFailure {
	code, permanent, message := classifyConversionError(conversionErr)
	if !permanent && attempts >= converterMaxAttempts {
		return batchFailure{code: errorRetryExhausted, permanent: true, message: fmt.Sprintf("%s after %d attempts: %s", code, attempts, message)}
	}
	return batchFailure{code: code, permanent: permanent, message: message}
}

// columns are the batch columns that record the failure and release the lease.
func (f batchFailure) columns(now time.Time, attempts int) []dal.DalSet {
	sets := []dal.DalSet{
		{ColumnName: "lease_owner", Value: nil},
		{ColumnName: "lease_until", Value: nil},
		{ColumnName: "processing_error_code", Value: string(f.code)},
		{ColumnName: "processing_error_message", Value: f.message},
	}
	if f.permanent {
		return append(sets,
			dal.DalSet{ColumnName: "status", Value: models.OtelBatchStatusPermanentError},
			dal.DalSet{ColumnName: "processed_at", Value: now},
		)
	}
	return append(sets,
		dal.DalSet{ColumnName: "status", Value: models.OtelBatchStatusRetryableError},
		dal.DalSet{ColumnName: "next_attempt_at", Value: now.Add(converterBackoff(attempts))},
	)
}

// recordBatchFailure releases the batch lease with a classified retry or quarantine state.
// A failure to persist that state is returned; lease expiry keeps the batch reclaimable.
func (c *rawConverter) recordBatchFailure(lease *batchLease, conversionErr error) errors.Error {
	label := rawBatchLabel(lease.table)
	failure := newBatchFailure(conversionErr, lease.attempts)
	if failure.code == errorLeaseLost {
		c.logWarn(conversionErr, fmt.Sprintf("Claude Code OTel %s %d lease was lost", label, lease.id))
		return nil
	}
	if err := c.db.UpdateColumns(lease.table, failure.columns(c.now().UTC(), lease.attempts),
		dal.Where("id = ? AND status = ? AND lease_owner = ?", lease.id, models.OtelBatchStatusProcessing, lease.owner),
	); err != nil {
		return errors.Default.Wrap(err, fmt.Sprintf("failed to record Claude Code OTel %s %d failure", label, lease.id))
	}
	c.logWarn(nil, fmt.Sprintf("Claude Code OTel %s %d conversion failed: code=%s permanent=%t attempt=%d", label, lease.id, failure.code, failure.permanent, lease.attempts))
	return nil
}

func converterBackoff(attempt int) time.Duration {
	if attempt > converterMaxBackoffExponent {
		attempt = converterMaxBackoffExponent
	}
	return time.Second * time.Duration(1<<uint(attempt))
}
