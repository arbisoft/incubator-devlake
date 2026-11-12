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

var _ plugin.MigrationScript = (*addAiCommits)(nil)

// addAiCommits adds the per-prompt commit rows. The schema is frozen here.
type addAiCommits struct{}

type aiCommit20261113 struct {
	archived.DomainEntity
	Provider           string    `gorm:"type:varchar(100);index"`
	WorkspaceKey       string    `gorm:"type:varchar(255);index;index:idx_ai_commits_workspace_prompt,priority:1"`
	SourceConnectionId uint64    `gorm:"index"`
	UserKey            string    `gorm:"type:varchar(255);index"`
	UserEmail          string    `gorm:"type:varchar(255);index"`
	SessionId          string    `gorm:"type:varchar(128);index"`
	PromptId           string    `gorm:"type:varchar(128);index:idx_ai_commits_workspace_prompt,priority:2"`
	CommitSha          string    `gorm:"type:varchar(40);index"`
	BranchName         string    `gorm:"type:varchar(255)"`
	RepositoryUrl      *string   `gorm:"type:varchar(255);index"`
	FirstSeenAt        time.Time `gorm:"type:datetime(3);index"`
}

func (aiCommit20261113) TableName() string { return "ai_commits" }

func (*addAiCommits) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &aiCommit20261113{})
}

func (*addAiCommits) Version() uint64 { return 20261113120000 }

func (*addAiCommits) Name() string { return "add AI commits table" }
