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
func (c *rawMetricConverter) processNextLogBatch() (bool, errors.Error) {
	batch, leaseOwner, err := c.claimNextLogBatch()
	if err != nil || batch == nil {
		return false, err
	}
	prepared, conversionErr := c.convertLogBatch(batch, leaseOwner)
	if conversionErr != nil {
		return true, c.recordBatchFailure(&models.OtelLogBatch{}, batch.ID, batch.AttemptCount, leaseOwner, conversionErr)
	}
	if message := prepared.diagnostic(); message != nil {
		c.logWarn(nil, fmt.Sprintf("Claude Code OTel raw log batch %d %s", batch.ID, *message))
	}
	return true, nil
}

// claimNextLogBatch claims the earliest nonterminal log batch. Like metrics, a batch
// waiting for retry holds the queue, so events of one session are applied in order.
func (c *rawMetricConverter) claimNextLogBatch() (*models.OtelLogBatch, string, errors.Error) {
	batch := &models.OtelLogBatch{}
	leaseOwner, err := c.claimNextBatch(batch)
	if err != nil || leaseOwner == "" {
		return nil, "", err
	}
	return batch, leaseOwner, nil
}

// convertLogBatch prepares events outside a transaction, then verifies the batch lease and
// commits events, prompt rollups and raw completion atomically.
func (c *rawMetricConverter) convertLogBatch(batch *models.OtelLogBatch, leaseOwner string) (*preparedLogBatch, error) {
	request, decodeErr := decodeOtelLogBatchRequest(batch)
	if decodeErr != nil {
		return nil, &conversionError{code: errorInvalidPayload, permanent: true, err: fmt.Errorf("decode raw OTLP logs payload: %w", decodeErr)}
	}
	prepared, err := c.prepareEvents(request, batch.ID)
	if err != nil {
		return nil, err
	}
	err = c.commitInLease(&models.OtelLogBatch{}, batch.ID, leaseOwner, &prepared.preparedBatch, func(tx dal.Transaction) error {
		workspaceKeys, err := c.applyEvents(tx, prepared.events)
		if err != nil {
			return err
		}
		if err := rollupSessions(tx, workspaceKeys, sessionTargets(prepared.events)); err != nil {
			return classifyStorageError(err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return prepared, nil
}

// applyEvents binds connections to their organization and upserts the events. It returns
// each connection's organization, which is the workspace key of its domain rows.
func (c *rawMetricConverter) applyEvents(tx dal.Transaction, events []preparedEvent) (map[uint64]string, error) {
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
