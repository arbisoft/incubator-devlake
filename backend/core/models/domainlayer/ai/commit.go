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

// AiCommit is one git commit a Claude Code session reported, from the vcs.ref.head.revision of a tool_result event.
type AiCommit struct {
	domainlayer.DomainEntity
	Provider           string `gorm:"type:varchar(100);index" json:"provider"`
	WorkspaceKey       string `gorm:"type:varchar(255);index;index:idx_ai_commits_workspace_prompt,priority:1" json:"workspaceKey"`
	SourceConnectionId uint64 `gorm:"index" json:"sourceConnectionId"`
	UserKey            string `gorm:"type:varchar(255);index" json:"userKey"`
	UserEmail          string `gorm:"type:varchar(255);index" json:"userEmail"`
	SessionId          string `gorm:"type:varchar(128);index" json:"sessionId"`
	PromptId           string `gorm:"type:varchar(128);index:idx_ai_commits_workspace_prompt,priority:2" json:"promptId"`
	// CommitSha is the lowercase 40-hex commit id.
	CommitSha  string `gorm:"type:varchar(40);index" json:"commitSha"`
	BranchName string `gorm:"type:varchar(255)" json:"branchName"`
	// RepositoryUrl is normalized like ai_prompts.repository_url.
	RepositoryUrl *string `gorm:"type:varchar(255);index" json:"repositoryUrl,omitempty"`
	// FirstSeenAt is the earliest tool_result in the prompt that reported the commit.
	FirstSeenAt time.Time `gorm:"type:datetime(3);index" json:"firstSeenAt"`
}

func (AiCommit) TableName() string { return "ai_commits" }
