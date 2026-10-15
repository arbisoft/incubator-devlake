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

// requeueLogBatches handles a logs replay request. Log conversion upserts events by their
// key and rebuilds each touched prompt from all stored events, so converting a batch again
// is idempotent and does not depend on receipt order. Replaying log batches is therefore
// returning them to the log queue: processed batches pick up converter fixes, and
// quarantined batches get a fresh retry budget. Batches are chosen by received_at, which
// the server sets, so batches without valid record timestamps or from a client whose clock
// is ahead are included too. They are requeued as replay_pending, behind live batches. The
// request completes once the batches are queued; the queue converts them afterwards. It
// returns the number of requeued batches.
func (c *rawConverter) requeueLogBatches(request *models.OtelReplayRequest, leaseOwner string) (int, error) {
	if err := c.validateLogReplayRange(request); err != nil {
		return 0, err
	}
	requeued := 0
	var lastBatchID uint64
	// The request lease was renewed when the request was claimed.
	lastRenewal := c.now().UTC()
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

// requeueLogBatchPage requeues up to logReplayPage replayable batches after afterID in one
// transaction, and returns their ids.
func (c *rawConverter) requeueLogBatchPage(request *models.OtelReplayRequest, leaseOwner string, afterID uint64) ([]uint64, error) {
	tx := c.db.Begin()
	if err := c.lockReplayLeases(tx, request.ID, leaseOwner); err != nil {
		c.rollback(tx)
		return nil, err
	}
	batchIDs := make([]uint64, 0, logReplayPage)
	if err := tx.Pluck("id", &batchIDs,
		dal.From(&models.OtelLogBatch{}),
		dal.Where("id > ? AND status IN ? AND received_at >= ? AND received_at < ?",
			afterID, replayableBatchStatuses, request.RangeStart.UTC(), request.RangeEnd.UTC()),
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
			{ColumnName: "processed_at", Value: nil},
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
