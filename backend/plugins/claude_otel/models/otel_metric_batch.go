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

package models

import (
	"time"

	"github.com/apache/incubator-devlake/core/models/common"
)

const (
	// Keep this outside the _raw_claude_* namespace. The legacy Claude scope
	// cleanup treats that prefix as its own raw-data namespace.
	OtelMetricBatchTable    = "_raw_otel_claude_code_metric_batches"
	OtelConverterLeaseTable = "_tool_claude_code_otel_converter_leases"
	OtelReplayRequestTable  = "_tool_claude_code_otel_replay_requests"

	OtelMetricBatchStatusPending        = "pending"
	OtelMetricBatchStatusProcessing     = "processing"
	OtelMetricBatchStatusProcessed      = "processed"
	OtelMetricBatchStatusRetryableError = "retryable_error"
	OtelMetricBatchStatusPermanentError = "permanent_error"

	OtelReplayRequestStatusPending    = "pending"
	OtelReplayRequestStatusProcessing = "processing"
	OtelReplayRequestStatusCompleted  = "completed"
	OtelReplayRequestStatusFailed     = "failed"
)

// OtelMetricBatch is the durable, replayable OTLP Metrics request accepted from
// the authenticated Collector. Tool and domain rows are derived asynchronously.
type OtelMetricBatch struct {
	common.Model
	ReceivedAt             time.Time  `gorm:"index;index:idx_otel_metric_batch_claim,priority:2"`
	PayloadSha256          []byte     `gorm:"type:binary(32);uniqueIndex"`
	PayloadProto           []byte     `gorm:"type:mediumblob"`
	PayloadSchemaVersion   int        `gorm:"not null"`
	ResourceCount          int        `gorm:"not null"`
	DatapointCount         int        `gorm:"not null"`
	MinObservedAt          *time.Time `gorm:"index"`
	MaxObservedAt          *time.Time `gorm:"index"`
	Status                 string     `gorm:"type:varchar(32);index;index:idx_otel_metric_batch_claim,priority:1"`
	AttemptCount           int        `gorm:"not null"`
	NextAttemptAt          *time.Time `gorm:"index"`
	LeaseUntil             *time.Time `gorm:"index"`
	LeaseOwner             *string    `gorm:"type:char(36);index"`
	ProcessingErrorCode    *string    `gorm:"type:varchar(64)"`
	ProcessingErrorMessage *string    `gorm:"type:text"`
	ProcessedAt            *time.Time `gorm:"index"`
}

func (OtelMetricBatch) TableName() string {
	return OtelMetricBatchTable
}

// OtelConverterLease elects one converter across Lake replicas. Cumulative conversion
// is stateful, so raw batches must be converted strictly in receipt order.
type OtelConverterLease struct {
	Name       string    `gorm:"type:varchar(64);primaryKey"`
	Owner      string    `gorm:"type:char(36)"`
	LeaseUntil time.Time `gorm:"type:datetime(3)"`
	UpdatedAt  time.Time
}

func (OtelConverterLease) TableName() string {
	return OtelConverterLeaseTable
}

// OtelReplayRequest asks the elected converter to rebuild hourly and canonical daily
// facts for whole UTC days from retained raw batches. Operators insert requests directly;
// there is intentionally no API or UI trigger.
type OtelReplayRequest struct {
	common.Model
	RangeStart      time.Time  `gorm:"type:datetime(3)"`
	RangeEnd        time.Time  `gorm:"type:datetime(3)"`
	Status          string     `gorm:"type:varchar(32);index"`
	LeaseUntil      *time.Time `gorm:"type:datetime(3);index"`
	LeaseOwner      *string    `gorm:"type:char(36);index"`
	ReplayedBatches int        `gorm:"not null;default:0"`
	SkippedBatches  int        `gorm:"not null;default:0"`
	ErrorMessage    *string    `gorm:"type:text"`
	CompletedAt     *time.Time `gorm:"type:datetime(3)"`
}

func (OtelReplayRequest) TableName() string {
	return OtelReplayRequestTable
}
