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

var _ plugin.MigrationScript = (*addAiPrompts)(nil)

// addAiPrompts creates the provider-neutral per-prompt AI facts.
type addAiPrompts struct{}

// The migration schema is frozen here so later domain model changes cannot alter it.
type aiPrompt20261012 struct {
	archived.DomainEntity
	Provider            string  `gorm:"type:varchar(100);index"`
	WorkspaceKey        string  `gorm:"type:varchar(255);index"`
	AccountId           string  `gorm:"type:varchar(255);index"`
	UserKey             string  `gorm:"type:varchar(255);index"`
	UserAccountId       *string `gorm:"type:varchar(255);index"`
	UserEmail           string  `gorm:"type:varchar(255);index"`
	SessionId           string  `gorm:"type:varchar(64);index"`
	PromptId            string  `gorm:"type:varchar(64);index"`
	CommandName         string  `gorm:"type:varchar(255)"`
	PromptLength        int64
	PromptText          *string
	StartedAt           time.Time `gorm:"type:datetime(3);index"`
	EndedAt             time.Time `gorm:"type:datetime(3)"`
	WallDurationMs      int64
	ApiDurationMs       int64
	ToolDurationMs      int64
	ApiRequests         int64
	Model               string `gorm:"type:varchar(255)"`
	InputTokens         int64
	OutputTokens        int64
	CacheReadTokens     int64
	CacheCreationTokens int64
	EstimatedCostUsd    string `gorm:"type:decimal(20,8);not null"`
	ToolCalls           int64
	ToolSuccesses       int64
	ToolFailures        int64
	EditsAccepted       int64
	EditsRejected       int64
	ApiErrors           int64
	ApiRefusals         int64
	SourceType          string `gorm:"type:varchar(64)"`
	SourceConnectionId  *uint64
	SourceUpdatedAt     time.Time `gorm:"type:datetime(3)"`
}

func (aiPrompt20261012) TableName() string { return "ai_prompts" }

func (script *addAiPrompts) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &aiPrompt20261012{})
}

func (*addAiPrompts) Version() uint64 { return 20261012140000 }

func (*addAiPrompts) Name() string { return "add AI prompt facts" }
