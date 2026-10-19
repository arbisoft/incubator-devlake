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
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

// logReplayPage bounds the batches one requeue transaction updates, so the lock on the
// converter lease row is held briefly.
const logReplayPage = 1000

// requeueLogBatches returns terminal and unleased replay_pending batches whose valid observed bounds overlap the range.
// Missing or reversed observed bounds use received_at as a legacy fallback.
// It requeues whole batches behind live logs, preserves pending retry state, and completes when queueing finishes.
func (c *rawConverter) requeueLogBatches(request *models.OtelReplayRequest, leaseOwner string) (int, error) {
	if err := c.validateLogReplayRange(request); err != nil {
		return 0, err
	}
	requeued := 0
	var lastBatchID uint64
	// A zero lastRenewal renews both leases before the first page, as metrics replay does:
	// the converter lease was taken at the start of the poll, before retention ran.
	var lastRenewal time.Time
	for {
		if err := c.renewReplayLeaseIfDue(request.ID, leaseOwner, &lastRenewal, false); err != nil {
			return requeued, err
		}
		batchIDs, err := c.requeueLogBatchPage(request, leaseOwner, lastBatchID)
		if err != nil {
			return requeued, err
		}
		requeued += len(batchIDs)
		if len(batchIDs) < logReplayPage {
			break
		}
		lastBatchID = batchIDs[len(batchIDs)-1]
	}
	return requeued, c.finishReplay(request.ID, leaseOwner, models.OtelReplayRequestStatusCompleted, requeued, 0, nil)
}

// validateLogReplayRange allows the current UTC day, unlike a metrics replay: requeued
// batches are converted like new ones, so a batch quarantined today can be replayed today.
func (c *rawConverter) validateLogReplayRange(request *models.OtelReplayRequest) error {
	if err := c.validateReplayDays(request); err != nil {
		return err
	}
	if request.RangeEnd.UTC().After(c.now().UTC().Truncate(24*time.Hour).AddDate(0, 0, 1)) {
		return fmt.Errorf("logs replay range must end by the end of the current UTC day")
	}
	return nil
}

// requeueLogBatchPage finds up to logReplayPage requeueable batches after afterID in one
// transaction and returns their ids. It resets only the terminal ones; batches already
// queued for replay keep their retry state.
func (c *rawConverter) requeueLogBatchPage(request *models.OtelReplayRequest, leaseOwner string, afterID uint64) ([]uint64, error) {
	tx := c.db.Begin()
	if err := c.lockReplayLeases(tx, request.ID, leaseOwner); err != nil {
		c.rollback(tx)
		return nil, err
	}
	batchIDs := make([]uint64, 0, logReplayPage)
	startUTC, endUTC := request.RangeStart.UTC(), request.RangeEnd.UTC()
	if err := tx.Pluck("id", &batchIDs,
		dal.From(&models.OtelLogBatch{}),
		dal.Where("id > ? AND ((min_observed_at IS NOT NULL AND max_observed_at IS NOT NULL AND min_observed_at <= max_observed_at AND max_observed_at >= ? AND min_observed_at < ?) OR ((min_observed_at IS NULL OR max_observed_at IS NULL OR min_observed_at > max_observed_at) AND received_at >= ? AND received_at < ?))",
			afterID, startUTC, endUTC, startUTC, endUTC),
		requeueableLogBatches(c.now().UTC()),
		dal.Orderby("id ASC"),
		dal.Limit(logReplayPage),
	); err != nil {
		c.rollback(tx)
		return nil, fmt.Errorf("find raw log batches for replay: %w", err)
	}
	if len(batchIDs) > 0 {
		if err := tx.UpdateColumns(&models.OtelLogBatch{}, []dal.DalSet{
			{ColumnName: "status", Value: models.OtelBatchStatusReplayPending},
			{ColumnName: "attempt_count", Value: 0},
			{ColumnName: "next_attempt_at", Value: nil},
			{ColumnName: "lease_owner", Value: nil},
			{ColumnName: "lease_until", Value: nil},
			{ColumnName: "processing_error_code", Value: nil},
			{ColumnName: "processing_error_message", Value: nil},
			// processed_at is kept until the replayed conversion records a new terminal state.
			// Matching terminal statuses also skips a batch that left them since the Pluck.
		}, dal.Where("id IN ? AND status IN ?", batchIDs, replayableBatchStatuses)); err != nil {
			c.rollback(tx)
			return nil, fmt.Errorf("requeue raw log batches for replay: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit Claude Code OTel log replay: %w", err)
	}
	return batchIDs, nil
}

// requeueableLogBatches selects the batches a logs replay counts: terminal batches, which it
// requeues, and batches already queued for replay that are not being converted at now.
func requeueableLogBatches(now time.Time) dal.Clause {
	return dal.Where("(status IN ? OR (status = ? AND (lease_until IS NULL OR lease_until < ?)))",
		replayableBatchStatuses, models.OtelBatchStatusReplayPending, now)
}
