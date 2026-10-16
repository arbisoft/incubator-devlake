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

// batchLease is one claimed raw batch: its table, row and attempt, the status it keeps
// while leased, and the lease owner this worker holds it under.
type batchLease struct {
	// table is a new empty batch of the batch's table, used to address its row.
	table    dal.Tabler
	id       uint64
	attempts int
	owner    string
	// status is processing for a live batch. A replayed log batch stays replay_pending for
	// its whole conversion, so it never enters the live queue, even when it fails or its
	// worker stops.
	status string
}

// replayed reports whether the lease converts a batch requeued by a replay.
func (l *batchLease) replayed() bool {
	return l.status == models.OtelBatchStatusReplayPending
}

// leasedStatus is the status a batch claimed from status keeps while it is converted.
func leasedStatus(status string) string {
	if status == models.OtelBatchStatusReplayPending {
		return models.OtelBatchStatusReplayPending
	}
	return models.OtelBatchStatusProcessing
}

// claimNextBatch claims only the earliest batch of batch's table in one of statuses and
// loads it into batch, a new empty metric or log batch; table is another new empty batch of
// the same table, which the lease keeps to address the row. A later batch never overtakes a
// batch that is waiting for retry or held by another lease, because cumulative series state
// depends on receipt order; only the replay queue skips them (see claimHeadQuery). A batch
// whose lease expired on its last allowed attempt is quarantined instead of claimed. It
// returns nil when nothing was claimed.
func (c *rawConverter) claimNextBatch(batch dal.Tabler, table dal.Tabler, statuses []string) (*batchLease, errors.Error) {
	now := c.now().UTC()
	head, err := c.claimHead(table, statuses, now)
	if err != nil || head == nil {
		return nil, err
	}
	if !isBatchClaimable(head.Status, head.LeaseUntil, head.NextAttemptAt, now) {
		return nil, nil
	}
	// A failure releases the lease, so an expired lease means the attempt ended without
	// recording one: the worker stopped, or the conversion outlived the lease.
	if head.LeaseUntil != nil && head.AttemptCount >= converterMaxAttempts {
		return nil, c.quarantineExpiredLease(table, head)
	}
	return c.claimBatch(batch, table, head)
}

// quarantineExpiredLease stops reclaiming a batch whose every attempt lost its lease, for
// example because converting it always takes longer than converterLeaseDuration. A lost
// lease records no failure, so without this the batch would be reclaimed forever.
func (c *rawConverter) quarantineExpiredLease(table dal.Tabler, head *rawBatchHead) errors.Error {
	label := rawBatchLabel(table)
	failure := batchFailure{code: errorRetryExhausted, permanent: true,
		message: fmt.Sprintf("%s after %d attempts: no attempt finished within its lease", errorLeaseLost, head.AttemptCount)}
	if err := c.db.UpdateColumns(table, failure.columns(c.now().UTC(), head.AttemptCount, head.Status == models.OtelBatchStatusReplayPending),
		dal.Where("id = ? AND status = ? AND attempt_count = ?", head.ID, head.Status, head.AttemptCount),
	); err != nil {
		return errors.Default.Wrap(err, fmt.Sprintf("failed to quarantine Claude Code OTel %s %d", label, head.ID))
	}
	c.logWarn(nil, fmt.Sprintf("Claude Code OTel %s %d quarantined: code=%s attempt=%d", label, head.ID, failure.code, head.AttemptCount))
	return nil
}

// claimHeadQuery builds the derived table claimHead reads: a UNION ALL of one
// single-status lookup per entry of statuses. The replay_pending lookup skips batches that
// are leased or waiting for their retry at now: replayed log batches do not depend on
// order, so one of them must not hold back the rest of the replay.
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
func claimHeadQuery(table dal.Tabler, statuses []string, now time.Time) (string, []interface{}) {
	branches := make([]string, 0, len(statuses))
	params := make([]interface{}, 0, len(statuses))
	for _, status := range statuses {
		where := "status = ?"
		params = append(params, status)
		if status == models.OtelBatchStatusReplayPending {
			where += " AND (next_attempt_at IS NULL OR next_attempt_at <= ?) AND (lease_until IS NULL OR lease_until < ?)"
			params = append(params, now, now)
		}
		branches = append(branches, "(SELECT id, status, attempt_count, next_attempt_at, lease_until, received_at FROM "+
			table.TableName()+" WHERE "+where+" ORDER BY received_at ASC, id ASC LIMIT 1)")
	}
	return "(" + strings.Join(branches, " UNION ALL ") + ") AS claim_heads", params
}

// claimHead finds the earliest batch of table in one of statuses in one query, or nil when
// there is none.
func (c *rawConverter) claimHead(table dal.Tabler, statuses []string, now time.Time) (*rawBatchHead, errors.Error) {
	query, params := claimHeadQuery(table, statuses, now)
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
	status := leasedStatus(head.Status)
	if err := c.db.UpdateColumns(
		table,
		[]dal.DalSet{
			{ColumnName: "status", Value: status},
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
	return &batchLease{table: table, id: head.ID, attempts: head.AttemptCount + 1, owner: leaseOwner, status: status}, nil
}

// isBatchClaimable applies to metric and log batches, which share the status lifecycle.
func isBatchClaimable(status string, leaseUntil, nextAttemptAt *time.Time, now time.Time) bool {
	switch status {
	case models.OtelBatchStatusProcessing:
		return leaseUntil == nil || leaseUntil.Before(now)
	case models.OtelBatchStatusRetryableError:
		return nextAttemptAt == nil || !nextAttemptAt.After(now)
	case models.OtelBatchStatusReplayPending:
		return (nextAttemptAt == nil || !nextAttemptAt.After(now)) && (leaseUntil == nil || leaseUntil.Before(now))
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
		dal.Where("id = ? AND status = ? AND lease_owner = ? AND lease_until > ?", lease.id, lease.status, lease.owner, c.now().UTC()),
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
		dal.Where("id = ? AND status = ? AND lease_owner = ?", lease.id, lease.status, lease.owner),
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

// columns are the batch columns that record the failure and release the lease. A replayed
// batch retries in the replay queue. A permanent failure always sets processed_at, which the
// ingestion status counts recent permanent errors by, so a replay that fails, including on a
// batch that converted before, is reported as a new error.
func (f batchFailure) columns(now time.Time, attempts int, replayed bool) []dal.DalSet {
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
	retryStatus := models.OtelBatchStatusRetryableError
	if replayed {
		retryStatus = models.OtelBatchStatusReplayPending
	}
	return append(sets,
		dal.DalSet{ColumnName: "status", Value: retryStatus},
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
	if err := c.db.UpdateColumns(lease.table, failure.columns(c.now().UTC(), lease.attempts, lease.replayed()),
		dal.Where("id = ? AND status = ? AND lease_owner = ?", lease.id, lease.status, lease.owner),
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
