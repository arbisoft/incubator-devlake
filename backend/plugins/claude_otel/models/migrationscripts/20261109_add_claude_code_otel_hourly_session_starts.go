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

var _ plugin.MigrationScript = (*addClaudeCodeOtelHourlySessionStarts)(nil)

type addClaudeCodeOtelHourlySessionStarts struct{}

type otelHourlySessionStart20261109 struct {
	ConnectionId    uint64    `gorm:"primaryKey;index"`
	TeamSlug        string    `gorm:"type:varchar(63);index"`
	OrganizationId  *string   `gorm:"type:char(36);index;index:idx_otel_hourly_session_starts_daily,priority:1"`
	UserKey         string    `gorm:"type:varchar(255);primaryKey;index:idx_otel_hourly_session_starts_daily,priority:2"`
	UserAccountId   *string   `gorm:"type:varchar(255);index"`
	UserAccountUUID *string   `gorm:"type:varchar(255);index"`
	UserEmail       *string   `gorm:"type:varchar(255);index"`
	HourStart       time.Time `gorm:"primaryKey;index;index:idx_otel_hourly_session_starts_daily,priority:3"`
	SessionId       string    `gorm:"type:varchar(128);primaryKey;index;default:''"`
	StartType       string    `gorm:"type:varchar(16);primaryKey;default:''"`
	StartCount      int64     `gorm:"not null;default:0"`
	FirstObservedAt time.Time `gorm:"type:datetime(3)"`
	LastObservedAt  time.Time `gorm:"type:datetime(3)"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func (otelHourlySessionStart20261109) TableName() string {
	return "_tool_claude_code_otel_hourly_session_starts"
}

func (script *addClaudeCodeOtelHourlySessionStarts) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &otelHourlySessionStart20261109{})
}

func (*addClaudeCodeOtelHourlySessionStarts) Version() uint64 { return 20261109130000 }

func (*addClaudeCodeOtelHourlySessionStarts) Name() string {
	return "add claude code otel hourly session starts"
}
