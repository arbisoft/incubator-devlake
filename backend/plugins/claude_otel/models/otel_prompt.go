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

import "time"

const OtelPromptEventTable = "_tool_claude_code_otel_prompt_events"

// OtelPromptEvent is one converted Claude Code event, stored once under its own ID so a
// repeated or reordered batch cannot double count. Each prompt's domain row is rebuilt
// from its events. Fields an event does not carry stay zero.
type OtelPromptEvent struct {
	Id                  string    `gorm:"type:char(64);primaryKey"`
	LogBatchId          uint64    `gorm:"index"`
	ConnectionId        uint64    `gorm:"index"`
	TeamSlug            string    `gorm:"type:varchar(63)"`
	OrganizationId      string    `gorm:"type:char(36);index:idx_otel_prompt_events_prompt,priority:1"`
	UserKey             string    `gorm:"type:varchar(255);index:idx_otel_prompt_events_prompt,priority:2"`
	UserAccountId       *string   `gorm:"type:varchar(255)"`
	UserEmail           *string   `gorm:"type:varchar(255)"`
	SessionId           string    `gorm:"type:varchar(64);index:idx_otel_prompt_events_prompt,priority:3"`
	PromptId            string    `gorm:"type:varchar(64);index:idx_otel_prompt_events_prompt,priority:4"`
	EventName           string    `gorm:"type:varchar(32)"`
	EventTime           time.Time `gorm:"type:datetime(3);index"`
	Sequence            int64
	Model               string `gorm:"type:varchar(255)"`
	CommandName         string `gorm:"type:varchar(255)"`
	ToolName            string `gorm:"type:varchar(255)"`
	Decision            string `gorm:"type:varchar(32)"`
	DecisionSource      string `gorm:"type:varchar(64)"`
	Success             *bool
	PromptLength        int64
	DurationMs          int64
	InputTokens         int64
	OutputTokens        int64
	CacheReadTokens     int64
	CacheCreationTokens int64
	CostUsdMicros       int64
	CreatedAt           time.Time
}

func (OtelPromptEvent) TableName() string {
	return OtelPromptEventTable
}
