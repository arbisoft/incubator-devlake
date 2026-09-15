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

var _ plugin.MigrationScript = (*addCanonicalAiDomain)(nil)

// addCanonicalAiDomain extends the existing shared AI activity contract without
// changing legacy rows, then creates the distinct daily model and tool-decision facts.
type addCanonicalAiDomain struct{}

// The migration schema is deliberately frozen here. Migration scripts must not
// import live domain models because future model changes must not alter a fresh
// installation's historical schema.
type aiActivity20260914 struct {
	archived.DomainEntity
	Provider           string    `gorm:"type:varchar(100);index"`
	AccountId          string    `gorm:"type:varchar(255);index"`
	UserEmail          string    `gorm:"type:varchar(255)"`
	Date               time.Time `gorm:"type:date;index"`
	Type               string    `gorm:"type:varchar(100)"`
	Model              string    `gorm:"type:varchar(100)"`
	InterfaceType      string    `gorm:"type:varchar(50)"`
	NumSessions        int
	SuggestionsCount   int
	AcceptanceCount    int
	LinesAdded         int
	LinesRemoved       int
	CommitsCreated     int
	PrsCreated         int
	InputTokens        int64
	OutputTokens       int64
	EstimatedCostUsd   float64
	WorkspaceKey       *string `gorm:"type:varchar(255);index"`
	UserKey            *string `gorm:"type:varchar(255);index"`
	UserAccountId      *string `gorm:"type:varchar(255);index"`
	RecordKind         *string `gorm:"type:varchar(64);index"`
	SourceType         *string `gorm:"type:varchar(64)"`
	SourceConnectionId *uint64
	SourceScopeId      *string    `gorm:"type:varchar(255)"`
	SourceUpdatedAt    *time.Time `gorm:"type:datetime(3)"`
}

func (aiActivity20260914) TableName() string { return "ai_activities" }

type aiModelUsage20260914 struct {
	archived.DomainEntity
	Provider            string    `gorm:"type:varchar(100);index"`
	WorkspaceKey        string    `gorm:"type:varchar(255);index"`
	AccountId           string    `gorm:"type:varchar(255);index"`
	UserKey             string    `gorm:"type:varchar(255);index"`
	UserAccountId       string    `gorm:"type:varchar(255);index"`
	UserEmail           string    `gorm:"type:varchar(255);index"`
	Date                time.Time `gorm:"type:date;index"`
	Model               string    `gorm:"type:varchar(255)"`
	InputTokens         int64
	OutputTokens        int64
	CacheReadTokens     int64
	CacheCreationTokens int64
	EstimatedCostUsd    string `gorm:"type:decimal(20,8);not null"`
	SourceType          string `gorm:"type:varchar(64)"`
	SourceConnectionId  *uint64
	SourceScopeId       *string   `gorm:"type:varchar(255)"`
	SourceUpdatedAt     time.Time `gorm:"type:datetime(3)"`
}

func (aiModelUsage20260914) TableName() string { return "ai_model_usages" }

type aiToolDecision20260914 struct {
	archived.DomainEntity
	Provider           string    `gorm:"type:varchar(100);index"`
	WorkspaceKey       string    `gorm:"type:varchar(255);index"`
	AccountId          string    `gorm:"type:varchar(255);index"`
	UserKey            string    `gorm:"type:varchar(255);index"`
	UserAccountId      string    `gorm:"type:varchar(255);index"`
	UserEmail          string    `gorm:"type:varchar(255);index"`
	Date               time.Time `gorm:"type:date;index"`
	ToolName           string    `gorm:"type:varchar(100)"`
	AcceptedCount      int64
	RejectedCount      int64
	SourceType         string `gorm:"type:varchar(64)"`
	SourceConnectionId *uint64
	SourceScopeId      *string   `gorm:"type:varchar(255)"`
	SourceUpdatedAt    time.Time `gorm:"type:datetime(3)"`
}

func (aiToolDecision20260914) TableName() string { return "ai_tool_decisions" }

type aiSourcePreference20260914 struct {
	Provider        string  `gorm:"type:varchar(100);primaryKey"`
	WorkspaceKey    string  `gorm:"type:varchar(255);primaryKey"`
	MetricFamily    string  `gorm:"type:varchar(64);primaryKey"`
	PreferredSource string  `gorm:"type:varchar(64)"`
	FallbackSource  *string `gorm:"type:varchar(64)"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func (aiSourcePreference20260914) TableName() string { return "ai_source_preferences" }

func (script *addCanonicalAiDomain) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(
		basicRes,
		&aiActivity20260914{},
		&aiModelUsage20260914{},
		&aiToolDecision20260914{},
		&aiSourcePreference20260914{},
	)
}

func (*addCanonicalAiDomain) Version() uint64 { return 20260914140000 }

func (*addCanonicalAiDomain) Name() string {
	return "add canonical AI activity reconciliation tables"
}
