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
	// RepositoryUrl is the origin remote of the repository the prompt ran in, from Claude
	// Code's vcs.repository.url.full. DevLake lowercases it, drops credentials and the .git
	// suffix, and rewrites SSH remotes as https. It is nil when the session had no origin remote or the client did not
	// report one. Compare it with LOWER(repos.url), then join project_mapping, for the DevLake
	// project.
	RepositoryUrl *string `gorm:"type:varchar(255);index" json:"repositoryUrl,omitempty"`
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

	// Effort is the reasoning effort level (such as low, medium, high, xhigh or max) of the
	// prompt's main conversation requests, from Claude Code's api_request effort attribute.
	// When no main-thread request reports one, it is the first effort any request reported.
	// It is nil when no request reported one: prompts that made no model request, clients
	// that do not send effort, and prompts converted before it was recorded.
	Effort *string `gorm:"type:varchar(64);index" json:"effort,omitempty"`
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

// Kinds of failure recorded for a prompt.
const (
	FailureKindApiError  = "api_error"
	FailureKindToolError = "tool_error"
)

// AiPromptFailure is one failed model request or tool call while handling a prompt.
// ErrorMessage is set only for API errors, whose message comes from the service. A tool
// error's message can echo file contents, so it never reaches DevLake; tool failures carry
// only their ErrorType.
type AiPromptFailure struct {
	domainlayer.DomainEntity
	Provider string `gorm:"type:varchar(100);index" json:"provider"`
	// WorkspaceKey and PromptId also share idx_ai_prompt_failures_workspace_prompt, the key
	// the prompt rollup deletes a prompt's failures by.
	WorkspaceKey string `gorm:"type:varchar(255);index;index:idx_ai_prompt_failures_workspace_prompt,priority:1" json:"workspaceKey"`
	UserKey      string `gorm:"type:varchar(255);index" json:"userKey"`
	UserEmail    string `gorm:"type:varchar(255);index" json:"userEmail"`
	SessionId    string `gorm:"type:varchar(128);index" json:"sessionId"`
	PromptId     string `gorm:"type:varchar(128);index;index:idx_ai_prompt_failures_workspace_prompt,priority:2" json:"promptId"`
	// AiPromptId is the id of the ai_prompts row this failure belongs to.
	AiPromptId  string    `gorm:"type:varchar(255);index" json:"aiPromptId"`
	FailureKind string    `gorm:"type:varchar(32);index" json:"failureKind"`
	OccurredAt  time.Time `gorm:"type:datetime(3);index" json:"occurredAt"`
	// Model and QuerySource are set for API errors.
	Model       string `gorm:"type:varchar(255)" json:"model"`
	QuerySource string `gorm:"type:varchar(100)" json:"querySource"`
	// ToolName is set for tool errors.
	ToolName     string `gorm:"type:varchar(255);index" json:"toolName"`
	ErrorType    string `gorm:"type:varchar(255);index" json:"errorType"`
	ErrorMessage string `gorm:"type:varchar(1024)" json:"errorMessage"`
	StatusCode   *int64 `json:"statusCode,omitempty"`
	Attempt      *int64 `json:"attempt,omitempty"`
	DurationMs   *int64 `json:"durationMs,omitempty"`
}

func (AiPromptFailure) TableName() string { return "ai_prompt_failures" }

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
