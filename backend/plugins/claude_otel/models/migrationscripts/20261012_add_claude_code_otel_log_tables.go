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

var _ plugin.MigrationScript = (*addClaudeCodeOtelLogTables)(nil)

type addClaudeCodeOtelLogTables struct{}

type otelLogBatch20261012 struct {
	archived.Model
	ReceivedAt             time.Time  `gorm:"index;index:idx_otel_log_batch_claim,priority:2"`
	PayloadSha256          []byte     `gorm:"type:binary(32);uniqueIndex"`
	PayloadProto           []byte     `gorm:"type:mediumblob"`
	PayloadSchemaVersion   int        `gorm:"not null"`
	ResourceCount          int        `gorm:"not null"`
	RecordCount            int        `gorm:"not null"`
	MinObservedAt          *time.Time `gorm:"index"`
	MaxObservedAt          *time.Time `gorm:"index"`
	Status                 string     `gorm:"type:varchar(32);index;index:idx_otel_log_batch_claim,priority:1"`
	AttemptCount           int        `gorm:"not null"`
	NextAttemptAt          *time.Time `gorm:"index"`
	LeaseUntil             *time.Time `gorm:"index"`
	LeaseOwner             *string    `gorm:"type:char(36);index"`
	ProcessingErrorCode    *string    `gorm:"type:varchar(64)"`
	ProcessingErrorMessage *string    `gorm:"type:text"`
	ProcessedAt            *time.Time `gorm:"index"`
}

func (otelLogBatch20261012) TableName() string { return "_raw_otel_claude_code_log_batches" }

type otelPromptEvent20261012 struct {
	Id                  string    `gorm:"type:char(64);primaryKey"`
	LogBatchId          uint64    `gorm:"index"`
	ConnectionId        uint64    `gorm:"index"`
	TeamSlug            string    `gorm:"type:varchar(63)"`
	OrganizationId      string    `gorm:"type:char(36);index:idx_otel_prompt_events_prompt,priority:1"`
	UserKey             string    `gorm:"type:varchar(255);index:idx_otel_prompt_events_prompt,priority:2"`
	UserAccountId       *string   `gorm:"type:varchar(255)"`
	UserEmail           *string   `gorm:"type:varchar(255)"`
	SessionId           string    `gorm:"type:varchar(64);index:idx_otel_prompt_events_prompt,priority:3"`
	PromptId            string    `gorm:"type:varchar(64);index:idx_otel_prompt_events_prompt,priority:4"`
	EventName           string    `gorm:"type:varchar(32)"`
	EventTime           time.Time `gorm:"type:datetime(3);index"`
	Sequence            int64
	Model               string `gorm:"type:varchar(255)"`
	CommandName         string `gorm:"type:varchar(255)"`
	ToolName            string `gorm:"type:varchar(255)"`
	Decision            string `gorm:"type:varchar(32)"`
	DecisionSource      string `gorm:"type:varchar(64)"`
	Success             *bool
	PromptLength        int64
	PromptText          *string
	DurationMs          int64
	InputTokens         int64
	OutputTokens        int64
	CacheReadTokens     int64
	CacheCreationTokens int64
	CostUsdMicros       int64
	CreatedAt           time.Time
}

func (otelPromptEvent20261012) TableName() string { return "_tool_claude_code_otel_prompt_events" }

func (script *addClaudeCodeOtelLogTables) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &otelLogBatch20261012{}, &otelPromptEvent20261012{})
}

func (*addClaudeCodeOtelLogTables) Version() uint64 { return 20261012130000 }

func (*addClaudeCodeOtelLogTables) Name() string { return "add claude code otel log tables" }
