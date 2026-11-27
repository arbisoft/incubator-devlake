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

import "time"

const (
	OtelHourlyActivityTable      = "_tool_claude_code_otel_hourly_activity"
	OtelHourlyModelUsageTable    = "_tool_claude_code_otel_hourly_model_usage"
	OtelHourlyToolUsageTable     = "_tool_claude_code_otel_hourly_tool_usage"
	OtelHourlySessionStartsTable = "_tool_claude_code_otel_hourly_session_starts"
	OtelMetricSeriesStateTable   = "_tool_claude_code_otel_series_state"
)

// OtelHourlyActivity stores Claude Code metrics whose grain is a connection,
// developer, UTC hour and repository.
type OtelHourlyActivity struct {
	ConnectionId      uint64    `gorm:"primaryKey;index;index:idx_otel_hourly_activity_repository,priority:1"`
	TeamSlug          string    `gorm:"type:varchar(63);index"`
	OrganizationId    *string   `gorm:"type:char(36);index;index:idx_otel_hourly_activity_daily,priority:1"`
	UserKey           string    `gorm:"type:varchar(255);primaryKey;index:idx_otel_hourly_activity_daily,priority:2"`
	UserAccountId     *string   `gorm:"type:varchar(255);index"`
	UserAccountUUID   *string   `gorm:"type:varchar(255);index"`
	UserEmail         *string   `gorm:"type:varchar(255);index"`
	HourStart         time.Time `gorm:"primaryKey;index;index:idx_otel_hourly_activity_daily,priority:3;index:idx_otel_hourly_activity_repository,priority:3"`
	RepositoryKey     []byte    `gorm:"type:binary(16);primaryKey"`
	RepositoryUrl     string    `gorm:"type:varchar(255);not null;default:'';index:idx_otel_hourly_activity_repository,priority:2"`
	SessionCount      int64     `gorm:"not null;default:0"`
	ActiveTimeSeconds string    `gorm:"type:decimal(20,3);not null;default:0"`
	LinesAdded        int64     `gorm:"not null;default:0"`
	LinesRemoved      int64     `gorm:"not null;default:0"`
	CommitsCreated    int64     `gorm:"not null;default:0"`
	PrsCreated        int64     `gorm:"not null;default:0"`
	FirstObservedAt   time.Time `gorm:"type:datetime(3)"`
	LastObservedAt    time.Time `gorm:"type:datetime(3)"`
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

func (OtelHourlyActivity) TableName() string { return OtelHourlyActivityTable }

// OtelHourlyModelUsage stores token and cost metrics by model, query source, effort, agent, skill and repository.
type OtelHourlyModelUsage struct {
	ConnectionId        uint64    `gorm:"primaryKey;index;index:idx_otel_hourly_model_usage_repository,priority:1"`
	TeamSlug            string    `gorm:"type:varchar(63);index"`
	OrganizationId      *string   `gorm:"type:char(36);index;index:idx_otel_hourly_model_usage_daily,priority:1"`
	UserKey             string    `gorm:"type:varchar(255);primaryKey;index:idx_otel_hourly_model_usage_daily,priority:2"`
	UserAccountId       *string   `gorm:"type:varchar(255);index"`
	UserAccountUUID     *string   `gorm:"type:varchar(255);index"`
	UserEmail           *string   `gorm:"type:varchar(255);index"`
	HourStart           time.Time `gorm:"primaryKey;index;index:idx_otel_hourly_model_usage_daily,priority:3;index:idx_otel_hourly_model_usage_repository,priority:3"`
	Model               string    `gorm:"type:varchar(255);primaryKey"`
	QuerySource         string    `gorm:"type:varchar(64);primaryKey"`
	Effort              string    `gorm:"type:varchar(16);primaryKey;default:''"`
	AgentName           string    `gorm:"type:varchar(64);primaryKey;default:''"`
	SkillName           string    `gorm:"type:varchar(64);primaryKey;default:''"`
	RepositoryKey       []byte    `gorm:"type:binary(16);primaryKey"`
	RepositoryUrl       string    `gorm:"type:varchar(255);not null;default:'';index:idx_otel_hourly_model_usage_repository,priority:2"`
	InputTokens         int64     `gorm:"not null;default:0"`
	OutputTokens        int64     `gorm:"not null;default:0"`
	CacheReadTokens     int64     `gorm:"not null;default:0"`
	CacheCreationTokens int64     `gorm:"not null;default:0"`
	EstimatedCostUSD    string    `gorm:"type:decimal(20,8);not null;default:0"`
	FirstObservedAt     time.Time `gorm:"type:datetime(3)"`
	LastObservedAt      time.Time `gorm:"type:datetime(3)"`
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

func (OtelHourlyModelUsage) TableName() string { return OtelHourlyModelUsageTable }

// OtelHourlyToolUsage stores Claude Code edit-tool decision counts by tool, language, decision source and repository.
type OtelHourlyToolUsage struct {
	ConnectionId    uint64    `gorm:"primaryKey;index;index:idx_otel_hourly_tool_usage_repository,priority:1"`
	TeamSlug        string    `gorm:"type:varchar(63);index"`
	OrganizationId  *string   `gorm:"type:char(36);index;index:idx_otel_hourly_tool_usage_daily,priority:1"`
	UserKey         string    `gorm:"type:varchar(255);primaryKey;index:idx_otel_hourly_tool_usage_daily,priority:2"`
	UserAccountId   *string   `gorm:"type:varchar(255);index"`
	UserAccountUUID *string   `gorm:"type:varchar(255);index"`
	UserEmail       *string   `gorm:"type:varchar(255);index"`
	HourStart       time.Time `gorm:"primaryKey;index;index:idx_otel_hourly_tool_usage_daily,priority:3;index:idx_otel_hourly_tool_usage_repository,priority:3"`
	ToolName        string    `gorm:"type:varchar(100);primaryKey"`
	Language        string    `gorm:"type:varchar(100);primaryKey"`
	DecisionSource  string    `gorm:"type:varchar(32);primaryKey;default:''"`
	RepositoryKey   []byte    `gorm:"type:binary(16);primaryKey"`
	RepositoryUrl   string    `gorm:"type:varchar(255);not null;default:'';index:idx_otel_hourly_tool_usage_repository,priority:2"`
	AcceptedCount   int64     `gorm:"not null;default:0"`
	RejectedCount   int64     `gorm:"not null;default:0"`
	FirstObservedAt time.Time `gorm:"type:datetime(3)"`
	LastObservedAt  time.Time `gorm:"type:datetime(3)"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func (OtelHourlyToolUsage) TableName() string { return OtelHourlyToolUsageTable }

// OtelHourlySessionStart stores Claude Code session starts by session, start type and repository.
type OtelHourlySessionStart struct {
	ConnectionId    uint64    `gorm:"primaryKey;index;index:idx_otel_hourly_session_starts_repository,priority:1"`
	TeamSlug        string    `gorm:"type:varchar(63);index"`
	OrganizationId  *string   `gorm:"type:char(36);index;index:idx_otel_hourly_session_starts_daily,priority:1"`
	UserKey         string    `gorm:"type:varchar(255);primaryKey;index:idx_otel_hourly_session_starts_daily,priority:2"`
	UserAccountId   *string   `gorm:"type:varchar(255);index"`
	UserAccountUUID *string   `gorm:"type:varchar(255);index"`
	UserEmail       *string   `gorm:"type:varchar(255);index"`
	HourStart       time.Time `gorm:"primaryKey;index;index:idx_otel_hourly_session_starts_daily,priority:3;index:idx_otel_hourly_session_starts_repository,priority:3"`
	SessionId       string    `gorm:"type:varchar(128);primaryKey;index;default:''"`
	StartType       string    `gorm:"type:varchar(16);primaryKey;default:''"`
	RepositoryKey   []byte    `gorm:"type:binary(16);primaryKey"`
	RepositoryUrl   string    `gorm:"type:varchar(255);not null;default:'';index:idx_otel_hourly_session_starts_repository,priority:2"`
	StartCount      int64     `gorm:"not null;default:0"`
	FirstObservedAt time.Time `gorm:"type:datetime(3)"`
	LastObservedAt  time.Time `gorm:"type:datetime(3)"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func (OtelHourlySessionStart) TableName() string { return OtelHourlySessionStartsTable }

// OtelMetricSeriesState is the durable state required to convert cumulative OTLP sums.
type OtelMetricSeriesState struct {
	SeriesHash        []byte `gorm:"type:binary(32);primaryKey"`
	ConnectionId      uint64 `gorm:"index"`
	MetricName        string `gorm:"type:varchar(255)"`
	Temporality       string `gorm:"type:varchar(32)"`
	StartTimeUnixNano uint64
	LastTimeUnixNano  uint64
	LastNumberValue   *string   `gorm:"type:decimal(38,9)"`
	UpdatedAt         time.Time `gorm:"type:datetime(3)"`
}

func (OtelMetricSeriesState) TableName() string { return OtelMetricSeriesStateTable }
