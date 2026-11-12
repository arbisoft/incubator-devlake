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

var _ plugin.MigrationScript = (*addAiPromptToolsAndSessionHooks)(nil)

// addAiPromptToolsAndSessionHooks adds the per-prompt tool rows, the per-session hook rows and the prompt hook and first-request columns. The schema is frozen here.
type addAiPromptToolsAndSessionHooks struct{}

type aiPrompt20261111 struct {
	HookCount                 int64
	HookBlockCount            int64
	HookErrorCount            int64
	HookDurationMs            int64
	IdleBeforeSeconds         *int64
	FirstRequestContextTokens int64
	FirstRequestCostUsd       *string `gorm:"type:decimal(20,8)"`
}

func (aiPrompt20261111) TableName() string { return "ai_prompts" }

type aiPromptTool20261111 struct {
	archived.DomainEntity
	Provider          string    `gorm:"type:varchar(100);index"`
	WorkspaceKey      string    `gorm:"type:varchar(255);index;index:idx_ai_prompt_tools_workspace_prompt,priority:1"`
	UserKey           string    `gorm:"type:varchar(255);index"`
	UserEmail         string    `gorm:"type:varchar(255);index"`
	SessionId         string    `gorm:"type:varchar(128);index"`
	PromptId          string    `gorm:"type:varchar(128);index;index:idx_ai_prompt_tools_workspace_prompt,priority:2"`
	AiPromptId        string    `gorm:"type:varchar(255);index"`
	StartedAt         time.Time `gorm:"type:datetime(3);index"`
	ToolName          string    `gorm:"type:varchar(255);index"`
	McpServerName     string    `gorm:"type:varchar(255);index"`
	CallCount         int64
	FailureCount      int64
	DurationMs        int64
	ConfigAcceptCount int64
	ConfigRejectCount int64
	UserAcceptCount   int64
	UserRejectCount   int64
}

func (aiPromptTool20261111) TableName() string { return "ai_prompt_tools" }

type aiSessionHook20261111 struct {
	archived.DomainEntity
	Provider           string    `gorm:"type:varchar(100);index"`
	WorkspaceKey       string    `gorm:"type:varchar(255);index"`
	SourceConnectionId uint64    `gorm:"index"`
	UserKey            string    `gorm:"type:varchar(255);index"`
	UserEmail          string    `gorm:"type:varchar(255);index"`
	SessionId          string    `gorm:"type:varchar(128);index"`
	RepositoryUrl      *string   `gorm:"type:varchar(255);index"`
	HookSource         string    `gorm:"type:varchar(64)"`
	HookEvent          string    `gorm:"type:varchar(64)"`
	HookName           string    `gorm:"type:varchar(255)"`
	HookType           string    `gorm:"type:varchar(64)"`
	FirstRegisteredAt  time.Time `gorm:"type:datetime(3);index"`
}

func (aiSessionHook20261111) TableName() string { return "ai_session_hooks" }

func (*addAiPromptToolsAndSessionHooks) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &aiPrompt20261111{}, &aiPromptTool20261111{}, &aiSessionHook20261111{})
}

func (*addAiPromptToolsAndSessionHooks) Version() uint64 { return 20261111120000 }

func (*addAiPromptToolsAndSessionHooks) Name() string {
	return "add AI prompt tools and session hooks tables"
}
