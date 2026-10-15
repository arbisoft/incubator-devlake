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
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	collectorlogs "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	"google.golang.org/protobuf/proto"
)

// processNextLogBatch claims and converts the head of the raw log queue under the
// converter lease. It returns true when a batch reached a new state.
func (c *rawConverter) processNextLogBatch() (bool, errors.Error) {
	batch, lease, err := c.claimNextLogBatch()
	if err != nil || batch == nil {
		return false, err
	}
	prepared, conversionErr := c.convertLogBatch(batch, lease)
	if conversionErr != nil {
		return true, c.recordBatchFailure(lease, conversionErr)
	}
	if message := prepared.diagnostic(); message != nil {
		c.logWarn(nil, fmt.Sprintf("Claude Code OTel raw log batch %d %s", batch.ID, *message))
	}
	return true, nil
}

// claimNextLogBatch claims the earliest live log batch, or when none is claimable, the
// earliest batch requeued by a replay. Like metrics, a live batch waiting for retry holds
// the live queue. Log conversion does not depend on receipt order, so a replay backlog is
// converted only while the live queue is empty or waiting, and never delays new events.
func (c *rawConverter) claimNextLogBatch() (*models.OtelLogBatch, *batchLease, errors.Error) {
	for _, statuses := range [][]string{nonterminalBatchStatuses, {models.OtelBatchStatusReplayPending}} {
		batch := &models.OtelLogBatch{}
		lease, err := c.claimNextBatch(batch, &models.OtelLogBatch{}, statuses)
		if err != nil {
			return nil, nil, err
		}
		if lease != nil {
			return batch, lease, nil
		}
	}
	return nil, nil, nil
}

// convertLogBatch prepares events outside a transaction, then verifies the batch lease and
// commits events, prompt rollups and raw completion atomically.
func (c *rawConverter) convertLogBatch(batch *models.OtelLogBatch, lease *batchLease) (*preparedLogBatch, error) {
	request, decodeErr := decodeOtelLogBatchRequest(batch)
	if decodeErr != nil {
		return nil, &conversionError{code: errorInvalidPayload, permanent: true, err: fmt.Errorf("decode raw OTLP logs payload: %w", decodeErr)}
	}
	prepared, err := c.prepareEvents(request, batch.ID)
	if err != nil {
		return nil, err
	}
	err = c.commitInLease(lease, &prepared.preparedBatch, func(tx dal.Transaction) error {
		workspaceKeys, err := c.applyEvents(tx, prepared.events)
		if err != nil {
			return err
		}
		return rollupSessions(tx, workspaceKeys, sessionTargets(prepared.events))
	})
	if err != nil {
		return nil, err
	}
	return prepared, nil
}

// applyEvents binds connections to their organization and upserts the events. It returns
// each connection's organization, which is the workspace key of its domain rows.
func (c *rawConverter) applyEvents(tx dal.Transaction, events []preparedEvent) (map[uint64]string, error) {
	workspaceKeys := make(map[uint64]string)
	for _, prepared := range events {
		if _, bound := workspaceKeys[prepared.connection.ID]; !bound {
			if err := bindConnectionOrganization(tx, prepared.connection, prepared.event.OrganizationId); err != nil {
				return nil, err
			}
			workspaceKeys[prepared.connection.ID] = prepared.event.OrganizationId
		}
		if err := tx.CreateOrUpdate(prepared.event); err != nil {
			return nil, classifyStorageError(fmt.Errorf("write Claude Code OTel event: %w", err))
		}
	}
	return workspaceKeys, nil
}

func decodeOtelLogBatchRequest(batch *models.OtelLogBatch) (*collectorlogs.ExportLogsServiceRequest, errors.Error) {
	if batch == nil {
		return nil, errors.BadInput.New("Claude Code OTel raw log batch is required")
	}
	if _, decodable := decodableSchemaVersions[batch.PayloadSchemaVersion]; !decodable {
		return nil, errors.BadInput.New(fmt.Sprintf("unsupported Claude Code OTel payload schema version %d", batch.PayloadSchemaVersion))
	}
	request := &collectorlogs.ExportLogsServiceRequest{}
	if err := proto.Unmarshal(batch.PayloadProto, request); err != nil {
		return nil, errors.BadInput.New("stored Claude Code OTel logs payload is invalid")
	}
	return request, nil
}
