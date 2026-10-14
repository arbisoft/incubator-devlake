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

package ai

import (
	"time"

	"github.com/apache/incubator-devlake/core/models/domainlayer"
)

// Permission modes reported by Claude Code. PermissionModeDefault is also used when a
// session never reported a mode change, with PermissionModeInferred set.
const (
	PermissionModeDefault = "default"
	PermissionModePlan    = "plan"
)

// Ways a skill used by a prompt was detected.
const (
	SkillDetectedViaActivation = "skill_activated"
	SkillDetectedViaSkillTool  = "skill_tool"
	SkillDetectedViaApiRequest = "api_request"
)

// AiPrompt is one developer prompt and everything it caused: model requests, tool calls,
// subagents and skills. Prompt text is not stored here. The claude_otel plugin keeps it
// in its raw log batches and _tool_claude_code_otel_events.prompt_text for 90 days.
type AiPrompt struct {
	domainlayer.DomainEntity
	Provider           string    `gorm:"type:varchar(100);index" json:"provider"`
	WorkspaceKey       string    `gorm:"type:varchar(255);index" json:"workspaceKey"`
	AccountId          string    `gorm:"type:varchar(255);index" json:"accountId"`
	UserKey            string    `gorm:"type:varchar(255);index" json:"userKey"`
	UserAccountId      *string   `gorm:"type:varchar(255);index" json:"userAccountId,omitempty"`
	UserEmail          string    `gorm:"type:varchar(255);index" json:"userEmail"`
	SourceConnectionId uint64    `gorm:"index" json:"sourceConnectionId"`
	SessionId          string    `gorm:"type:varchar(128);index" json:"sessionId"`
	PromptId           string    `gorm:"type:varchar(128);index" json:"promptId"`
	StartedAt          time.Time `gorm:"type:datetime(3);index" json:"startedAt"`
	EndedAt            time.Time `gorm:"type:datetime(3)" json:"endedAt"`
	PromptLength       int64     `json:"promptLength"`
	// CommandName is the slash command the prompt invoked, if any.
	CommandName   string `gorm:"type:varchar(255);index" json:"commandName"`
	CommandSource string `gorm:"type:varchar(32)" json:"commandSource"`
	// PermissionMode is the mode the prompt ran in (default, plan, acceptEdits, auto,
	// bypassPermissions). PermissionModeInferred is true when the session reported no
	// mode change, so the mode is assumed rather than observed.
	PermissionMode         string `gorm:"type:varchar(64);index" json:"permissionMode"`
	PermissionModeInferred bool   `json:"permissionModeInferred"`
	ModelsUsed             string `gorm:"type:varchar(1024)" json:"modelsUsed"`
	ApiRequestCount        int64  `json:"apiRequestCount"`
	ApiErrorCount          int64  `json:"apiErrorCount"`
	InputTokens            int64  `json:"inputTokens"`
	OutputTokens           int64  `json:"outputTokens"`
	CacheReadTokens        int64  `json:"cacheReadTokens"`
	CacheCreationTokens    int64  `json:"cacheCreationTokens"`
	EstimatedCostUsd       string `gorm:"type:decimal(20,8);not null" json:"estimatedCostUsd"`
	ToolCallCount          int64  `json:"toolCallCount"`
	ToolFailureCount       int64  `json:"toolFailureCount"`
	ToolRejectCount        int64  `json:"toolRejectCount"`
	SubagentCount          int64  `json:"subagentCount"`
	SkillCount             int64  `json:"skillCount"`
	UsedSkill              bool   `gorm:"index" json:"usedSkill"`
	SourceType             string `gorm:"type:varchar(64)" json:"sourceType"`
}

func (AiPrompt) TableName() string { return "ai_prompts" }

// AiPromptSkill is one skill used while handling a prompt.
type AiPromptSkill struct {
	domainlayer.DomainEntity
	Provider     string `gorm:"type:varchar(100);index" json:"provider"`
	WorkspaceKey string `gorm:"type:varchar(255);index" json:"workspaceKey"`
	UserKey      string `gorm:"type:varchar(255);index" json:"userKey"`
	SessionId    string `gorm:"type:varchar(128);index" json:"sessionId"`
	PromptId     string `gorm:"type:varchar(128);index" json:"promptId"`
	SkillName    string `gorm:"type:varchar(255);index" json:"skillName"`
	// InvocationTrigger is user-slash, claude-proactive or nested-skill when known.
	InvocationTrigger string    `gorm:"type:varchar(64)" json:"invocationTrigger"`
	SkillSource       string    `gorm:"type:varchar(64)" json:"skillSource"`
	PluginName        string    `gorm:"type:varchar(255)" json:"pluginName"`
	DetectedVia       string    `gorm:"type:varchar(64)" json:"detectedVia"`
	FirstUsedAt       time.Time `gorm:"type:datetime(3)" json:"firstUsedAt"`
}

func (AiPromptSkill) TableName() string { return "ai_prompt_skills" }

// AiPermissionModeChange is one permission mode switch inside a Claude Code session.
type AiPermissionModeChange struct {
	domainlayer.DomainEntity
	Provider     string    `gorm:"type:varchar(100);index" json:"provider"`
	WorkspaceKey string    `gorm:"type:varchar(255);index" json:"workspaceKey"`
	UserKey      string    `gorm:"type:varchar(255);index" json:"userKey"`
	UserEmail    string    `gorm:"type:varchar(255);index" json:"userEmail"`
	SessionId    string    `gorm:"type:varchar(128);index" json:"sessionId"`
	ChangedAt    time.Time `gorm:"type:datetime(3);index" json:"changedAt"`
	FromMode     string    `gorm:"type:varchar(64)" json:"fromMode"`
	ToMode       string    `gorm:"type:varchar(64);index" json:"toMode"`
	Trigger      string    `gorm:"type:varchar(64)" json:"trigger"`
}

func (AiPermissionModeChange) TableName() string { return "ai_permission_mode_changes" }
