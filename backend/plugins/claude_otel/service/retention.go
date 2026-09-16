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
)

const (
	// rawBatchRetention keeps terminal raw batches replayable for 90 days.
	rawBatchRetention = 90 * 24 * time.Hour
	// seriesStateRetention outlives any Collector queue outage; an idle cumulative counter
	// belongs to an ended CLI process and is never continued.
	seriesStateRetention = 30 * 24 * time.Hour
	retentionInterval    = time.Hour
	retentionDeleteBatch = 1000
	// retentionMaxDeleteBatches bounds one run so retention never starves conversion.
	retentionMaxDeleteBatches = 20
)

// runRetention deletes expired terminal raw batches and idle series state at most once per
// retentionInterval. Nonterminal batches are never deleted.
func (c *rawMetricConverter) runRetention() errors.Error {
	now := c.now().UTC()
	if now.Before(c.nextRetentionAt) {
		return nil
	}
	// Schedule before cleanup so a failure does not turn retention into a two-second
	// retry loop that starves conversion.
	c.nextRetentionAt = now.Add(retentionInterval)
	if err := c.deleteExpiredRawBatches(now); err != nil {
		return err
	}
	return c.deleteExpiredSeriesState(now)
}

func (c *rawMetricConverter) deleteExpiredRawBatches(now time.Time) errors.Error {
	for deletes := 0; deletes < retentionMaxDeleteBatches; deletes++ {
		batchIDs := make([]uint64, 0, retentionDeleteBatch)
		if err := c.db.Pluck("id", &batchIDs,
			dal.From(&models.OtelMetricBatch{}),
			dal.Where("received_at < ? AND status IN ?", now.Add(-rawBatchRetention), replayableBatchStatuses),
			dal.Orderby("id ASC"),
			dal.Limit(retentionDeleteBatch),
		); err != nil {
			return errors.Default.Wrap(err, "failed to find expired Claude Code OTel raw batches")
		}
		if len(batchIDs) == 0 {
			break
		}
		if err := c.db.Delete(&models.OtelMetricBatch{}, dal.Where("id IN ?", batchIDs)); err != nil {
			return errors.Default.Wrap(err, "failed to delete expired Claude Code OTel raw batches")
		}
		if len(batchIDs) < retentionDeleteBatch {
			break
		}
	}
	return nil
}

func (c *rawMetricConverter) deleteExpiredSeriesState(now time.Time) errors.Error {
	for deletes := 0; deletes < retentionMaxDeleteBatches; deletes++ {
		stateHashes := make([][]byte, 0, retentionDeleteBatch)
		if err := c.db.Pluck("series_hash", &stateHashes,
			dal.From(&models.OtelMetricSeriesState{}),
			dal.Where("updated_at < ?", now.Add(-seriesStateRetention)),
			dal.Orderby("series_hash ASC"),
			dal.Limit(retentionDeleteBatch),
		); err != nil {
			return errors.Default.Wrap(err, fmt.Sprintf("failed to find Claude Code OTel series state idle since %s", now.Add(-seriesStateRetention).Format(time.RFC3339)))
		}
		if len(stateHashes) == 0 {
			break
		}
		if err := c.db.Delete(&models.OtelMetricSeriesState{}, dal.Where("series_hash IN ?", stateHashes)); err != nil {
			return errors.Default.Wrap(err, fmt.Sprintf("failed to delete Claude Code OTel series state idle since %s", now.Add(-seriesStateRetention).Format(time.RFC3339)))
		}
		if len(stateHashes) < retentionDeleteBatch {
			break
		}
	}
	return nil
}
