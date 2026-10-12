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

var _ plugin.MigrationScript = (*addClaudeCodeOtelSessionHours)(nil)

type addClaudeCodeOtelSessionHours struct{}

type otelSessionHour20261009 struct {
	ConnectionId        uint64    `gorm:"primaryKey;index;index:idx_otel_session_hours_session,priority:1"`
	TeamSlug            string    `gorm:"type:varchar(63);index"`
	OrganizationId      *string   `gorm:"type:char(36);index"`
	UserKey             string    `gorm:"type:varchar(255);primaryKey;index:idx_otel_session_hours_user,priority:1"`
	UserAccountId       *string   `gorm:"type:varchar(255);index"`
	UserAccountUUID     *string   `gorm:"type:varchar(255);index"`
	UserEmail           *string   `gorm:"type:varchar(255);index"`
	SessionId           string    `gorm:"type:varchar(64);primaryKey;index:idx_otel_session_hours_session,priority:2"`
	HourStart           time.Time `gorm:"primaryKey;index;index:idx_otel_session_hours_user,priority:2"`
	TerminalType        string    `gorm:"type:varchar(64);not null;default:''"`
	AppVersion          string    `gorm:"type:varchar(32);not null;default:''"`
	OsType              string    `gorm:"type:varchar(32);not null;default:''"`
	SessionCount        int64     `gorm:"not null;default:0"`
	ActiveTimeSeconds   string    `gorm:"type:decimal(20,3);not null;default:0"`
	LinesAdded          int64     `gorm:"not null;default:0"`
	LinesRemoved        int64     `gorm:"not null;default:0"`
	CommitsCreated      int64     `gorm:"not null;default:0"`
	PrsCreated          int64     `gorm:"not null;default:0"`
	InputTokens         int64     `gorm:"not null;default:0"`
	OutputTokens        int64     `gorm:"not null;default:0"`
	CacheReadTokens     int64     `gorm:"not null;default:0"`
	CacheCreationTokens int64     `gorm:"not null;default:0"`
	EstimatedCostUSD    string    `gorm:"type:decimal(20,8);not null;default:0"`
	AcceptedCount       int64     `gorm:"not null;default:0"`
	RejectedCount       int64     `gorm:"not null;default:0"`
	FirstObservedAt     time.Time `gorm:"type:datetime(3)"`
	LastObservedAt      time.Time `gorm:"type:datetime(3)"`
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

func (otelSessionHour20261009) TableName() string { return "_tool_claude_code_otel_session_hours" }

func (script *addClaudeCodeOtelSessionHours) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &otelSessionHour20261009{})
}

func (*addClaudeCodeOtelSessionHours) Version() uint64 { return 20261009120000 }

func (*addClaudeCodeOtelSessionHours) Name() string { return "add claude code otel session hours" }
