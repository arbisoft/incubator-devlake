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

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

// requeueLogBatches handles a logs replay request. Log conversion upserts events by their
// key and rebuilds each touched prompt from all stored events, so converting a batch again
// is idempotent and does not depend on receipt order. Replaying log batches is therefore
// returning them to the log queue: processed batches pick up converter fixes, and
// quarantined batches get a fresh retry budget. The request completes once the batches are
// queued; the queue converts them afterwards. It returns the number of requeued batches.
func (c *rawConverter) requeueLogBatches(request *models.OtelReplayRequest, leaseOwner string) (int, error) {
	if err := c.validateReplayRange(request); err != nil {
		return 0, err
	}
	rangeFilter := dal.Where("status IN ? AND max_observed_at >= ? AND min_observed_at < ?",
		replayableBatchStatuses, request.RangeStart.UTC(), request.RangeEnd.UTC())
	tx := c.db.Begin()
	if err := c.lockReplayLeases(tx, request.ID, leaseOwner); err != nil {
		c.rollback(tx)
		return 0, err
	}
	count, err := tx.Count(dal.From(&models.OtelLogBatch{}), rangeFilter)
	if err != nil {
		c.rollback(tx)
		return 0, fmt.Errorf("count raw log batches for replay: %w", err)
	}
	if err := tx.UpdateColumns(&models.OtelLogBatch{}, []dal.DalSet{
		{ColumnName: "status", Value: models.OtelBatchStatusPending},
		{ColumnName: "attempt_count", Value: 0},
		{ColumnName: "next_attempt_at", Value: nil},
		{ColumnName: "lease_owner", Value: nil},
		{ColumnName: "lease_until", Value: nil},
		{ColumnName: "processing_error_code", Value: nil},
		{ColumnName: "processing_error_message", Value: nil},
		{ColumnName: "processed_at", Value: nil},
	}, rangeFilter); err != nil {
		c.rollback(tx)
		return 0, fmt.Errorf("requeue raw log batches for replay: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit Claude Code OTel log replay: %w", err)
	}
	replayed := int(count)
	return replayed, c.finishReplay(request.ID, leaseOwner, models.OtelReplayRequestStatusCompleted, replayed, 0, nil)
}
