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
	"encoding/json"
	"time"

	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/migrationscripts/archived"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/migrationhelper"
)

var _ plugin.MigrationScript = (*addClaudeCodeOtelLogEvents)(nil)

// addClaudeCodeOtelLogEvents adds raw OTLP log batch storage and the per-event table
// derived from it.
type addClaudeCodeOtelLogEvents struct{}

type otelLogBatch20261014 struct {
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

func (otelLogBatch20261014) TableName() string { return "_raw_otel_claude_code_log_batches" }

type otelEvent20261014 struct {
	EventKey            []byte  `gorm:"type:binary(32);primaryKey"`
	ConnectionId        uint64  `gorm:"index;index:idx_otel_event_user_time,priority:1"`
	TeamSlug            string  `gorm:"type:varchar(63);index"`
	OrganizationId      string  `gorm:"type:char(36);index"`
	UserKey             string  `gorm:"type:varchar(255);index:idx_otel_event_user_time,priority:2"`
	UserAccountId       *string `gorm:"type:varchar(255)"`
	UserAccountUUID     *string `gorm:"type:varchar(255)"`
	UserEmail           *string `gorm:"type:varchar(255);index"`
	SessionId           string  `gorm:"type:varchar(128);index:idx_otel_event_session_time,priority:1"`
	PromptId            string  `gorm:"type:varchar(128);index"`
	EventName           string  `gorm:"type:varchar(100);index"`
	EventSequence       *int64
	EventTimestamp      time.Time `gorm:"type:datetime(3);index;index:idx_otel_event_user_time,priority:3;index:idx_otel_event_session_time,priority:2"`
	AppVersion          string    `gorm:"type:varchar(64)"`
	TerminalType        string    `gorm:"type:varchar(100)"`
	Model               string    `gorm:"type:varchar(255)"`
	ToolName            string    `gorm:"type:varchar(255);index"`
	SkillName           string    `gorm:"type:varchar(255);index"`
	AgentName           string    `gorm:"type:varchar(255)"`
	PluginName          string    `gorm:"type:varchar(255)"`
	McpServerName       string    `gorm:"type:varchar(255)"`
	QuerySource         string    `gorm:"type:varchar(100)"`
	Success             *bool
	DurationMs          *int64
	CostUsd             *string         `gorm:"type:decimal(20,8)"`
	InputTokens         int64           `gorm:"not null;default:0"`
	OutputTokens        int64           `gorm:"not null;default:0"`
	CacheReadTokens     int64           `gorm:"not null;default:0"`
	CacheCreationTokens int64           `gorm:"not null;default:0"`
	PromptText          *string         `gorm:"type:mediumtext"`
	Attributes          json.RawMessage `gorm:"type:json"`
	RawBatchId          uint64          `gorm:"index"`
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

func (otelEvent20261014) TableName() string { return "_tool_claude_code_otel_events" }

func (script *addClaudeCodeOtelLogEvents) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &otelLogBatch20261014{}, &otelEvent20261014{})
}

func (*addClaudeCodeOtelLogEvents) Version() uint64 { return 20261014120000 }

func (*addClaudeCodeOtelLogEvents) Name() string { return "add claude code otel log events" }
