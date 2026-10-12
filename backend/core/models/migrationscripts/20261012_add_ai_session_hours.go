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

var _ plugin.MigrationScript = (*addAiSessionHours)(nil)

// addAiSessionHours creates the provider-neutral per-session hourly AI facts.
type addAiSessionHours struct{}

// The migration schema is frozen here so later domain model changes cannot alter it.
type aiSessionHour20261012 struct {
	archived.DomainEntity
	Provider            string    `gorm:"type:varchar(100);index"`
	WorkspaceKey        string    `gorm:"type:varchar(255);index"`
	AccountId           string    `gorm:"type:varchar(255);index"`
	UserKey             string    `gorm:"type:varchar(255);index"`
	UserAccountId       *string   `gorm:"type:varchar(255);index"`
	UserEmail           string    `gorm:"type:varchar(255);index"`
	SessionId           string    `gorm:"type:varchar(64);index"`
	HourStart           time.Time `gorm:"index"`
	TerminalType        string    `gorm:"type:varchar(64)"`
	ClientVersion       string    `gorm:"type:varchar(32)"`
	OsType              string    `gorm:"type:varchar(32)"`
	SessionCount        int64
	ActiveTimeSeconds   string `gorm:"type:decimal(20,3);not null"`
	LinesAdded          int64
	LinesRemoved        int64
	CommitsCreated      int64
	PrsCreated          int64
	InputTokens         int64
	OutputTokens        int64
	CacheReadTokens     int64
	CacheCreationTokens int64
	EstimatedCostUsd    string `gorm:"type:decimal(20,8);not null"`
	AcceptedCount       int64
	RejectedCount       int64
	FirstObservedAt     time.Time `gorm:"type:datetime(3)"`
	LastObservedAt      time.Time `gorm:"type:datetime(3)"`
	SourceType          string    `gorm:"type:varchar(64)"`
	SourceConnectionId  *uint64
	SourceScopeId       *string   `gorm:"type:varchar(255)"`
	SourceUpdatedAt     time.Time `gorm:"type:datetime(3)"`
}

func (aiSessionHour20261012) TableName() string { return "ai_session_hours" }

func (script *addAiSessionHours) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &aiSessionHour20261012{})
}

func (*addAiSessionHours) Version() uint64 { return 20261012120000 }

func (*addAiSessionHours) Name() string { return "add AI session hour facts" }
