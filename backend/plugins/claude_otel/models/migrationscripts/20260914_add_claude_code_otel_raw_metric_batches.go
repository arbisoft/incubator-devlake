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

package migrationscripts

import (
	"time"

	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/migrationscripts/archived"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/migrationhelper"
)

var _ plugin.MigrationScript = (*addClaudeCodeOtelRawMetricBatches)(nil)

type addClaudeCodeOtelRawMetricBatches struct{}

type otelConnection20260914 struct {
	archived.Model
	Status         string     `gorm:"type:varchar(32);index"`
	RevokedAt      *time.Time `gorm:"index"`
	OrganizationId *string    `gorm:"type:char(36);index"`
}

func (otelConnection20260914) TableName() string {
	return "_tool_claude_code_otel_connections"
}

type otelMetricBatch20260914 struct {
	archived.Model
	ReceivedAt             time.Time  `gorm:"index;index:idx_otel_metric_batch_claim,priority:2"`
	PayloadSha256          []byte     `gorm:"type:binary(32);uniqueIndex"`
	PayloadProto           []byte     `gorm:"type:mediumblob"`
	PayloadJSON            *string    `gorm:"type:json"`
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

func (otelMetricBatch20260914) TableName() string {
	return "_raw_otel_claude_code_metric_batches"
}

type otelConverterLease20260914 struct {
	Name       string    `gorm:"type:varchar(64);primaryKey"`
	Owner      string    `gorm:"type:char(36)"`
	LeaseUntil time.Time `gorm:"type:datetime(3)"`
	UpdatedAt  time.Time
}

func (otelConverterLease20260914) TableName() string {
	return "_tool_claude_code_otel_converter_leases"
}

type otelReplayRequest20260914 struct {
	archived.Model
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

func (otelReplayRequest20260914) TableName() string {
	return "_tool_claude_code_otel_replay_requests"
}

type otelCredential20260914 struct {
	archived.Model
	ConnectionId uint64
	RevokedAt    *time.Time
}

func (otelCredential20260914) TableName() string {
	return "_tool_claude_code_otel_credentials"
}

func (script *addClaudeCodeOtelRawMetricBatches) Up(basicRes context.BasicRes) errors.Error {
	if err := migrationhelper.AutoMigrateTables(
		basicRes,
		&otelConnection20260914{},
		&otelMetricBatch20260914{},
		&otelConverterLease20260914{},
		&otelReplayRequest20260914{},
	); err != nil {
		return err
	}
	return backfillOtelConnectionRevokedAt(basicRes)
}

func backfillOtelConnectionRevokedAt(basicRes context.BasicRes) errors.Error {
	database := basicRes.GetDal()
	connections := make([]*otelConnection20260914, 0)
	if err := database.All(&connections, dal.Where("status = ? AND revoked_at IS NULL", "revoked")); err != nil {
		return err
	}
	for _, connection := range connections {
		revokedAt := connection.UpdatedAt
		credentials := make([]*otelCredential20260914, 0, 1)
		if err := database.All(&credentials,
			dal.Where("connection_id = ? AND revoked_at IS NOT NULL", connection.ID),
			dal.Orderby("revoked_at DESC"),
			dal.Limit(1),
		); err != nil {
			return err
		}
		if len(credentials) > 0 {
			revokedAt = *credentials[0].RevokedAt
		}
		if err := database.UpdateColumn(&otelConnection20260914{}, "revoked_at", revokedAt, dal.Where("id = ?", connection.ID)); err != nil {
			return err
		}
	}
	return nil
}

func (*addClaudeCodeOtelRawMetricBatches) Version() uint64 {
	return 20260914120000
}

func (*addClaudeCodeOtelRawMetricBatches) Name() string {
	return "add claude code otel raw metric batches"
}
