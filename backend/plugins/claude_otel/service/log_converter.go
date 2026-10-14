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
	"github.com/google/uuid"
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
		return true, c.recordLogBatchFailure(batch, leaseOwner, conversionErr)
	}
	if prepared.skippedCount > 0 {
		c.logWarn(nil, fmt.Sprintf("Claude Code OTel raw log batch %d skipped %d resource group(s)", batch.ID, prepared.skippedCount))
	}
	return true, nil
}

// claimNextLogBatch claims the earliest nonterminal log batch. Like metrics, a batch
// waiting for retry holds the queue, so events of one session are applied in order.
func (c *rawMetricConverter) claimNextLogBatch() (*models.OtelLogBatch, string, errors.Error) {
	now := c.now().UTC()
	var head *models.OtelLogBatch
	// One query per status keeps each lookup on idx_otel_log_batch_claim; see findClaimHead.
	for _, status := range nonterminalBatchStatuses {
		candidate := &models.OtelLogBatch{}
		err := c.db.First(candidate,
			dal.Select("id, status, attempt_count, next_attempt_at, lease_until, received_at"),
			dal.Where("status = ?", status),
			dal.Orderby("received_at ASC, id ASC"),
		)
		if err != nil {
			if c.db.IsErrorNotFound(err) {
				continue
			}
			return nil, "", errors.Default.Wrap(err, "failed to find the next Claude Code OTel raw log batch")
		}
		if head == nil || candidate.ReceivedAt.Before(head.ReceivedAt) ||
			(candidate.ReceivedAt.Equal(head.ReceivedAt) && candidate.ID < head.ID) {
			head = candidate
		}
	}
	if head == nil {
		return nil, "", nil
	}
	if !isBatchClaimable(head.Status, head.LeaseUntil, head.NextAttemptAt, now) {
		return nil, "", nil
	}
	leaseOwner := uuid.NewString()
	if err := c.db.UpdateColumns(
		&models.OtelLogBatch{},
		[]dal.DalSet{
			{ColumnName: "status", Value: models.OtelMetricBatchStatusProcessing},
			{ColumnName: "lease_owner", Value: leaseOwner},
			{ColumnName: "lease_until", Value: now.Add(converterLeaseDuration)},
			{ColumnName: "next_attempt_at", Value: nil},
			{ColumnName: "attempt_count", Value: head.AttemptCount + 1},
		},
		dal.Where("id = ? AND status = ? AND attempt_count = ?", head.ID, head.Status, head.AttemptCount),
	); err != nil {
		return nil, "", errors.Default.Wrap(err, "failed to claim Claude Code OTel raw log batch")
	}
	batch := &models.OtelLogBatch{}
	if err := c.db.First(batch, dal.Where("id = ? AND lease_owner = ?", head.ID, leaseOwner)); err != nil {
		if c.db.IsErrorNotFound(err) {
			return nil, "", nil
		}
		return nil, "", errors.Default.Wrap(err, "failed to load claimed Claude Code OTel raw log batch")
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

	tx := c.db.Begin()
	claimedBatch := &models.OtelLogBatch{}
	if err := tx.First(claimedBatch,
		dal.Select("id"),
		dal.Where("id = ? AND status = ? AND lease_owner = ? AND lease_until > ?", batch.ID, models.OtelMetricBatchStatusProcessing, leaseOwner, c.now().UTC()),
		dal.Lock(true, false),
	); err != nil {
		c.rollback(tx)
		return nil, &conversionError{code: errorLeaseLost, err: fmt.Errorf("verify raw log batch lease: %w", err)}
	}
	workspaceKeys, err := c.applyEvents(tx, prepared.events)
	if err != nil {
		c.rollback(tx)
		return nil, err
	}
	if err := rollupSessions(tx, workspaceKeys, sessionTargets(prepared.events)); err != nil {
		c.rollback(tx)
		return nil, classifyStorageError(err)
	}
	if err := tx.UpdateColumns(
		&models.OtelLogBatch{},
		[]dal.DalSet{
			{ColumnName: "status", Value: models.OtelMetricBatchStatusProcessed},
			{ColumnName: "lease_owner", Value: nil},
			{ColumnName: "lease_until", Value: nil},
			{ColumnName: "processing_error_code", Value: prepared.diagnosticCode()},
			{ColumnName: "processing_error_message", Value: prepared.diagnostic()},
			{ColumnName: "processed_at", Value: c.now().UTC()},
		},
		dal.Where("id = ? AND status = ? AND lease_owner = ?", batch.ID, models.OtelMetricBatchStatusProcessing, leaseOwner),
	); err != nil {
		c.rollback(tx)
		return nil, classifyStorageError(fmt.Errorf("mark raw log batch processed: %w", err))
	}
	if err := tx.Commit(); err != nil {
		return nil, &conversionError{code: errorStorageFailure, err: fmt.Errorf("commit Claude Code OTel log conversion: %w", err)}
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

// recordLogBatchFailure releases the log batch lease with a retry or quarantine state.
func (c *rawMetricConverter) recordLogBatchFailure(batch *models.OtelLogBatch, leaseOwner string, conversionErr error) errors.Error {
	code, permanent, message := classifyConversionError(conversionErr)
	now := c.now().UTC()
	if code == errorLeaseLost {
		c.logWarn(conversionErr, fmt.Sprintf("Claude Code OTel raw log batch %d lease was lost", batch.ID))
		return nil
	}
	if !permanent && batch.AttemptCount >= converterMaxAttempts {
		message = fmt.Sprintf("%s after %d attempts: %s", code, batch.AttemptCount, message)
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
			dal.DalSet{ColumnName: "status", Value: models.OtelMetricBatchStatusPermanentError},
			dal.DalSet{ColumnName: "processed_at", Value: now},
		)
	} else {
		sets = append(sets,
			dal.DalSet{ColumnName: "status", Value: models.OtelMetricBatchStatusRetryableError},
			dal.DalSet{ColumnName: "next_attempt_at", Value: now.Add(converterBackoff(batch.AttemptCount))},
		)
	}
	if err := c.db.UpdateColumns(&models.OtelLogBatch{}, sets,
		dal.Where("id = ? AND status = ? AND lease_owner = ?", batch.ID, models.OtelMetricBatchStatusProcessing, leaseOwner),
	); err != nil {
		return errors.Default.Wrap(err, fmt.Sprintf("failed to record Claude Code OTel raw log batch %d failure", batch.ID))
	}
	c.logWarn(nil, fmt.Sprintf("Claude Code OTel raw log batch %d conversion failed: code=%s permanent=%t attempt=%d", batch.ID, code, permanent, batch.AttemptCount))
	return nil
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
