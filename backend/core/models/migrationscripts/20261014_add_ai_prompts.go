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

// addAiPrompts adds per-prompt AI usage facts: the prompt itself, the skills it used and
// the permission mode changes of its session. The schema is frozen here.
type addAiPrompts struct{}

type aiPrompt20261014 struct {
	archived.DomainEntity
	Provider               string    `gorm:"type:varchar(100);index"`
	WorkspaceKey           string    `gorm:"type:varchar(255);index"`
	AccountId              string    `gorm:"type:varchar(255);index"`
	UserKey                string    `gorm:"type:varchar(255);index"`
	UserAccountId          *string   `gorm:"type:varchar(255);index"`
	UserEmail              string    `gorm:"type:varchar(255);index"`
	SourceConnectionId     uint64    `gorm:"index"`
	SessionId              string    `gorm:"type:varchar(128);index"`
	PromptId               string    `gorm:"type:varchar(128);index"`
	StartedAt              time.Time `gorm:"type:datetime(3);index"`
	EndedAt                time.Time `gorm:"type:datetime(3)"`
	PromptLength           int64
	CommandName            string `gorm:"type:varchar(255);index"`
	CommandSource          string `gorm:"type:varchar(32)"`
	PermissionMode         string `gorm:"type:varchar(64);index"`
	PermissionModeInferred bool
	ModelsUsed             string `gorm:"type:varchar(1024)"`
	ApiRequestCount        int64
	ApiErrorCount          int64
	InputTokens            int64
	OutputTokens           int64
	CacheReadTokens        int64
	CacheCreationTokens    int64
	EstimatedCostUsd       string `gorm:"type:decimal(20,8);not null"`
	ToolCallCount          int64
	ToolFailureCount       int64
	ToolRejectCount        int64
	SubagentCount          int64
	SkillCount             int64
	UsedSkill              bool   `gorm:"index"`
	SourceType             string `gorm:"type:varchar(64)"`
}

func (aiPrompt20261014) TableName() string { return "ai_prompts" }

type aiPromptSkill20261014 struct {
	archived.DomainEntity
	Provider          string    `gorm:"type:varchar(100);index"`
	WorkspaceKey      string    `gorm:"type:varchar(255);index"`
	UserKey           string    `gorm:"type:varchar(255);index"`
	SessionId         string    `gorm:"type:varchar(128);index"`
	PromptId          string    `gorm:"type:varchar(128);index"`
	SkillName         string    `gorm:"type:varchar(255);index"`
	InvocationTrigger string    `gorm:"type:varchar(64)"`
	SkillSource       string    `gorm:"type:varchar(64)"`
	PluginName        string    `gorm:"type:varchar(255)"`
	DetectedVia       string    `gorm:"type:varchar(64)"`
	FirstUsedAt       time.Time `gorm:"type:datetime(3)"`
}

func (aiPromptSkill20261014) TableName() string { return "ai_prompt_skills" }

type aiPermissionModeChange20261014 struct {
	archived.DomainEntity
	Provider     string    `gorm:"type:varchar(100);index"`
	WorkspaceKey string    `gorm:"type:varchar(255);index"`
	UserKey      string    `gorm:"type:varchar(255);index"`
	UserEmail    string    `gorm:"type:varchar(255);index"`
	SessionId    string    `gorm:"type:varchar(128);index"`
	ChangedAt    time.Time `gorm:"type:datetime(3);index"`
	FromMode     string    `gorm:"type:varchar(64)"`
	ToMode       string    `gorm:"type:varchar(64);index"`
	Trigger      string    `gorm:"type:varchar(64)"`
}

func (aiPermissionModeChange20261014) TableName() string { return "ai_permission_mode_changes" }

func (*addAiPrompts) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(
		basicRes,
		&aiPrompt20261014{},
		&aiPromptSkill20261014{},
		&aiPermissionModeChange20261014{},
	)
}

func (*addAiPrompts) Version() uint64 { return 20261014120000 }

func (*addAiPrompts) Name() string {
	return "add AI prompt, prompt skill and permission mode change tables"
}
