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
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/migrationhelper"
)

var _ plugin.MigrationScript = (*addClaudeCodeOtelHourlyMetrics)(nil)

type addClaudeCodeOtelHourlyMetrics struct{}

type otelHourlyActivity20260914 struct {
	ConnectionId      uint64    `gorm:"primaryKey;index"`
	TeamSlug          string    `gorm:"type:varchar(63);index"`
	OrganizationId    *string   `gorm:"type:char(36);index;index:idx_otel_hourly_activity_daily,priority:1"`
	UserKey           string    `gorm:"type:varchar(255);primaryKey;index:idx_otel_hourly_activity_daily,priority:2"`
	UserAccountId     *string   `gorm:"type:varchar(255);index"`
	UserAccountUUID   *string   `gorm:"type:varchar(255);index"`
	UserEmail         *string   `gorm:"type:varchar(255);index"`
	HourStart         time.Time `gorm:"primaryKey;index;index:idx_otel_hourly_activity_daily,priority:3"`
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

func (otelHourlyActivity20260914) TableName() string { return "_tool_claude_code_otel_hourly_activity" }

type otelHourlyModelUsage20260914 struct {
	ConnectionId        uint64    `gorm:"primaryKey;index"`
	TeamSlug            string    `gorm:"type:varchar(63);index"`
	OrganizationId      *string   `gorm:"type:char(36);index;index:idx_otel_hourly_model_usage_daily,priority:1"`
	UserKey             string    `gorm:"type:varchar(255);primaryKey;index:idx_otel_hourly_model_usage_daily,priority:2"`
	UserAccountId       *string   `gorm:"type:varchar(255);index"`
	UserAccountUUID     *string   `gorm:"type:varchar(255);index"`
	UserEmail           *string   `gorm:"type:varchar(255);index"`
	HourStart           time.Time `gorm:"primaryKey;index;index:idx_otel_hourly_model_usage_daily,priority:3"`
	Model               string    `gorm:"type:varchar(255);primaryKey"`
	QuerySource         string    `gorm:"type:varchar(64);primaryKey"`
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

func (otelHourlyModelUsage20260914) TableName() string {
	return "_tool_claude_code_otel_hourly_model_usage"
}

type otelHourlyToolUsage20260914 struct {
	ConnectionId    uint64    `gorm:"primaryKey;index"`
	TeamSlug        string    `gorm:"type:varchar(63);index"`
	OrganizationId  *string   `gorm:"type:char(36);index;index:idx_otel_hourly_tool_usage_daily,priority:1"`
	UserKey         string    `gorm:"type:varchar(255);primaryKey;index:idx_otel_hourly_tool_usage_daily,priority:2"`
	UserAccountId   *string   `gorm:"type:varchar(255);index"`
	UserAccountUUID *string   `gorm:"type:varchar(255);index"`
	UserEmail       *string   `gorm:"type:varchar(255);index"`
	HourStart       time.Time `gorm:"primaryKey;index;index:idx_otel_hourly_tool_usage_daily,priority:3"`
	ToolName        string    `gorm:"type:varchar(100);primaryKey"`
	Language        string    `gorm:"type:varchar(100);primaryKey"`
	AcceptedCount   int64     `gorm:"not null;default:0"`
	RejectedCount   int64     `gorm:"not null;default:0"`
	FirstObservedAt time.Time `gorm:"type:datetime(3)"`
	LastObservedAt  time.Time `gorm:"type:datetime(3)"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func (otelHourlyToolUsage20260914) TableName() string {
	return "_tool_claude_code_otel_hourly_tool_usage"
}

type otelMetricSeriesState20260914 struct {
	SeriesHash        []byte `gorm:"type:binary(32);primaryKey"`
	ConnectionId      uint64 `gorm:"index"`
	MetricName        string `gorm:"type:varchar(255)"`
	Temporality       string `gorm:"type:varchar(32)"`
	StartTimeUnixNano uint64
	LastTimeUnixNano  uint64
	LastNumberValue   *string   `gorm:"type:decimal(38,9)"`
	UpdatedAt         time.Time `gorm:"type:datetime(3)"`
}

func (otelMetricSeriesState20260914) TableName() string { return "_tool_claude_code_otel_series_state" }

func (script *addClaudeCodeOtelHourlyMetrics) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(
		basicRes,
		&otelHourlyActivity20260914{},
		&otelHourlyModelUsage20260914{},
		&otelHourlyToolUsage20260914{},
		&otelMetricSeriesState20260914{},
	)
}

func (*addClaudeCodeOtelHourlyMetrics) Version() uint64 { return 20260914130000 }

func (*addClaudeCodeOtelHourlyMetrics) Name() string { return "add claude code otel hourly metrics" }
