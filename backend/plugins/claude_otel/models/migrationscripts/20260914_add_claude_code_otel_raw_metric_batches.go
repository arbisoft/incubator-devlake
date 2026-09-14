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
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/migrationscripts/archived"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/migrationhelper"
)

var _ plugin.MigrationScript = (*addClaudeCodeOtelRawMetricBatches)(nil)

type addClaudeCodeOtelRawMetricBatches struct{}

type otelConnection20260914 struct {
	archived.Model
	RevokedAt      *time.Time `gorm:"index"`
	OrganizationId *string    `gorm:"type:char(36);index"`
}

func (otelConnection20260914) TableName() string {
	return "_tool_claude_code_otel_connections"
}

type otelMetricBatch20260914 struct {
	archived.Model
	ReceivedAt             time.Time  `gorm:"index"`
	PayloadSha256          []byte     `gorm:"type:binary(32);uniqueIndex"`
	PayloadProto           []byte     `gorm:"type:mediumblob"`
	PayloadJSON            *string    `gorm:"type:json"`
	PayloadSchemaVersion   int        `gorm:"not null"`
	ResourceCount          int        `gorm:"not null"`
	DatapointCount         int        `gorm:"not null"`
	MinObservedAt          *time.Time `gorm:"index"`
	MaxObservedAt          *time.Time `gorm:"index"`
	Status                 string     `gorm:"type:varchar(32);index"`
	AttemptCount           int        `gorm:"not null"`
	NextAttemptAt          *time.Time `gorm:"index"`
	LeaseUntil             *time.Time `gorm:"index"`
	LeaseOwner             *string    `gorm:"type:char(36);index"`
	ProcessingErrorCode    *string    `gorm:"type:varchar(64)"`
	ProcessingErrorMessage *string    `gorm:"type:text"`
	ProcessedAt            *time.Time `gorm:"index"`
}

func (otelMetricBatch20260914) TableName() string {
	return "_raw_claude_code_otel_metric_batches"
}

func (script *addClaudeCodeOtelRawMetricBatches) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(
		basicRes,
		&otelConnection20260914{},
		&otelMetricBatch20260914{},
	)
}

func (*addClaudeCodeOtelRawMetricBatches) Version() uint64 {
	return 20260914120000
}

func (*addClaudeCodeOtelRawMetricBatches) Name() string {
	return "add claude code otel raw metric batches"
}
