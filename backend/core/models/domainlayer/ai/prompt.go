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

// Permission modes reported by Claude Code. PermissionModeDefault is also the assumed mode when nothing revealed one.
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
	// PermissionMode is the mode the prompt ran in; PermissionModeInferred is true when no tool decision or mode change revealed it.
	PermissionMode         string `gorm:"type:varchar(64);index" json:"permissionMode"`
	PermissionModeInferred bool   `json:"permissionModeInferred"`
	// ModelsUsed lists the base model IDs of the prompt's API requests, comma-separated and
	// sorted, without snapshot dates or variant suffixes such as [1m].
	ModelsUsed          string `gorm:"type:varchar(1024)" json:"modelsUsed"`
	ApiRequestCount     int64  `json:"apiRequestCount"`
	ApiErrorCount       int64  `json:"apiErrorCount"`
	InputTokens         int64  `json:"inputTokens"`
	OutputTokens        int64  `json:"outputTokens"`
	CacheReadTokens     int64  `json:"cacheReadTokens"`
	CacheCreationTokens int64  `json:"cacheCreationTokens"`
	EstimatedCostUsd    string `gorm:"type:decimal(20,8);not null" json:"estimatedCostUsd"`
	ToolCallCount       int64  `json:"toolCallCount"`
	ToolFailureCount    int64  `json:"toolFailureCount"`
	ToolRejectCount     int64  `json:"toolRejectCount"`
	SubagentCount       int64  `json:"subagentCount"`
	SkillCount          int64  `json:"skillCount"`
	UsedSkill           bool   `gorm:"index" json:"usedSkill"`
	SourceType          string `gorm:"type:varchar(64)" json:"sourceType"`

	// Effort is the reasoning effort level (such as low, medium, high, xhigh or max) of the
	// prompt's main conversation requests, from Claude Code's api_request effort attribute.
	// When no main-thread request reports one, it is the first effort any request reported.
	// It is nil when no request reported one: prompts that made no model request, clients
	// that do not send effort, and prompts converted before it was recorded.
	Effort *string `gorm:"type:varchar(64);index" json:"effort,omitempty"`

	// HookCount, HookBlockCount, HookErrorCount and HookDurationMs sum the prompt's hook_execution_complete events.
	HookCount      int64 `json:"hookCount"`
	HookBlockCount int64 `json:"hookBlockCount"`
	HookErrorCount int64 `json:"hookErrorCount"`
	HookDurationMs int64 `json:"hookDurationMs"`
	// IdleBeforeSeconds is the time from the session's previous main-thread request to this prompt's first; nil when there is none.
	IdleBeforeSeconds *int64 `json:"idleBeforeSeconds,omitempty"`
	// FirstRequestContextTokens is the input, cache read and cache creation tokens of the prompt's first main-thread request.
	FirstRequestContextTokens int64 `json:"firstRequestContextTokens"`
	// FirstRequestCostUsd is the cost of that first main-thread request.
	FirstRequestCostUsd *string `gorm:"type:decimal(20,8)" json:"firstRequestCostUsd,omitempty"`
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

// AiPromptTool is one tool's calls and permission decisions while handling a prompt, one row per tool and MCP server.
type AiPromptTool struct {
	domainlayer.DomainEntity
	Provider string `gorm:"type:varchar(100);index" json:"provider"`
	// WorkspaceKey and PromptId also share idx_ai_prompt_tools_workspace_prompt, the key the prompt rollup deletes a prompt's tools by.
	WorkspaceKey string `gorm:"type:varchar(255);index;index:idx_ai_prompt_tools_workspace_prompt,priority:1" json:"workspaceKey"`
	UserKey      string `gorm:"type:varchar(255);index" json:"userKey"`
	UserEmail    string `gorm:"type:varchar(255);index" json:"userEmail"`
	SessionId    string `gorm:"type:varchar(128);index" json:"sessionId"`
	PromptId     string `gorm:"type:varchar(128);index;index:idx_ai_prompt_tools_workspace_prompt,priority:2" json:"promptId"`
	// AiPromptId is the id of the ai_prompts row this tool row belongs to.
	AiPromptId string `gorm:"type:varchar(255);index" json:"aiPromptId"`
	// StartedAt is the start of the prompt.
	StartedAt     time.Time `gorm:"type:datetime(3);index" json:"startedAt"`
	ToolName      string    `gorm:"type:varchar(255);index" json:"toolName"`
	McpServerName string    `gorm:"type:varchar(255);index" json:"mcpServerName"`
	// CallCount, FailureCount and DurationMs come from tool_result events.
	CallCount    int64 `json:"callCount"`
	FailureCount int64 `json:"failureCount"`
	DurationMs   int64 `json:"durationMs"`
	// The accept and reject counts come from tool_decision events; a source starting with user is a user decision, any other a config one.
	ConfigAcceptCount int64 `json:"configAcceptCount"`
	ConfigRejectCount int64 `json:"configRejectCount"`
	UserAcceptCount   int64 `json:"userAcceptCount"`
	UserRejectCount   int64 `json:"userRejectCount"`
}

func (AiPromptTool) TableName() string { return "ai_prompt_tools" }

// AiSessionHook is one hook registered in a Claude Code session, from its hook_registered events.
type AiSessionHook struct {
	domainlayer.DomainEntity
	Provider           string  `gorm:"type:varchar(100);index" json:"provider"`
	WorkspaceKey       string  `gorm:"type:varchar(255);index" json:"workspaceKey"`
	SourceConnectionId uint64  `gorm:"index" json:"sourceConnectionId"`
	UserKey            string  `gorm:"type:varchar(255);index" json:"userKey"`
	UserEmail          string  `gorm:"type:varchar(255);index" json:"userEmail"`
	SessionId          string  `gorm:"type:varchar(128);index" json:"sessionId"`
	RepositoryUrl      *string `gorm:"type:varchar(255);index" json:"repositoryUrl,omitempty"`
	HookSource         string  `gorm:"type:varchar(64)" json:"hookSource"`
	HookEvent          string  `gorm:"type:varchar(64)" json:"hookEvent"`
	HookName           string  `gorm:"type:varchar(255)" json:"hookName"`
	HookType           string  `gorm:"type:varchar(64)" json:"hookType"`
	// FirstRegisteredAt is the earliest registration of the hook in the session.
	FirstRegisteredAt time.Time `gorm:"type:datetime(3);index" json:"firstRegisteredAt"`
}

func (AiSessionHook) TableName() string { return "ai_session_hooks" }
