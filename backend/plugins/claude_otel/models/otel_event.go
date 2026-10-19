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

package models

import (
	"encoding/json"
	"time"
)

const OtelEventTable = "_tool_claude_code_otel_events"

// OtelEvent is one Claude Code OTLP log event. Commonly queried attributes are typed
// columns; every other attribute the client sent is kept in Attributes. Response, tool
// input and API body content is stripped before storage. Prompt text is kept only here and
// in raw batches, never in ai_* tables, and is cleared after the raw retention window.
type OtelEvent struct {
	// EventKey is a hash of the event's natural identity, so replay is idempotent.
	EventKey            []byte  `gorm:"type:binary(32);primaryKey"`
	ConnectionId        uint64  `gorm:"index;index:idx_otel_event_user_time,priority:1"`
	TeamSlug            string  `gorm:"type:varchar(63);index"`
	OrganizationId      string  `gorm:"type:char(36);index"`
	UserKey             string  `gorm:"type:varchar(255);index:idx_otel_event_user_time,priority:2"`
	UserAccountId       *string `gorm:"type:varchar(255)"`
	UserAccountUUID     *string `gorm:"type:varchar(255)"`
	UserEmail           *string `gorm:"type:varchar(255);index"`
	SessionId           string  `gorm:"type:varchar(128);index:idx_otel_event_session_time,priority:1"`
	PromptId            string  `gorm:"type:varchar(128);index"`
	EventName           string  `gorm:"type:varchar(100);index"`
	EventSequence       *int64
	EventTimestamp      time.Time `gorm:"type:datetime(3);index;index:idx_otel_event_user_time,priority:3;index:idx_otel_event_session_time,priority:2"`
	AppVersion          string    `gorm:"type:varchar(64)"`
	TerminalType        string    `gorm:"type:varchar(100)"`
	Model               string    `gorm:"type:varchar(255)"`
	ToolName            string    `gorm:"type:varchar(255);index"`
	SkillName           string    `gorm:"type:varchar(255);index"`
	AgentName           string    `gorm:"type:varchar(255)"`
	PluginName          string    `gorm:"type:varchar(255)"`
	McpServerName       string    `gorm:"type:varchar(255)"`
	QuerySource         string    `gorm:"type:varchar(100)"`
	CommandName         string    `gorm:"type:varchar(255)"`
	Success             *bool
	DurationMs          *int64
	CostUsd             *string `gorm:"type:decimal(20,8)"`
	InputTokens         int64   `gorm:"not null;default:0"`
	OutputTokens        int64   `gorm:"not null;default:0"`
	CacheReadTokens     int64   `gorm:"not null;default:0"`
	CacheCreationTokens int64   `gorm:"not null;default:0"`
	// PromptText is the user_prompt event's text, up to Claude Code's 60 KB content limit.
	PromptText *string         `gorm:"type:mediumtext"`
	Attributes json.RawMessage `gorm:"type:json"`
	RawBatchId uint64          `gorm:"index"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func (OtelEvent) TableName() string { return OtelEventTable }
