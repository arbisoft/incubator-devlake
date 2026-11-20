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
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/migrationhelper"
)

var _ plugin.MigrationScript = (*addDashboardDateIndexes)(nil)

// addDashboardDateIndexes adds the indexes the dashboard date filters and sha lookups need.
type addDashboardDateIndexes struct{}

type commit20261113 struct {
	Sha          string    `gorm:"primaryKey;type:varchar(40)"`
	AuthoredDate time.Time `gorm:"index:idx_commits_authored_date"`
}

func (commit20261113) TableName() string { return "commits" }

type repoCommit20261113 struct {
	RepoId    string `gorm:"primaryKey;type:varchar(255)"`
	CommitSha string `gorm:"primaryKey;type:varchar(40);index:idx_repo_commits_commit_sha"`
}

func (repoCommit20261113) TableName() string { return "repo_commits" }

type issueChangelog20261113 struct {
	Id          string    `gorm:"primaryKey;type:varchar(255)"`
	CreatedDate time.Time `gorm:"index:idx_issue_changelogs_created_date"`
}

func (issueChangelog20261113) TableName() string { return "issue_changelogs" }

func (*addDashboardDateIndexes) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &commit20261113{}, &repoCommit20261113{}, &issueChangelog20261113{})
}

func (*addDashboardDateIndexes) Version() uint64 { return 20261113130000 }

func (*addDashboardDateIndexes) Name() string {
	return "add indexes on commit authored date, changelog created date and repo commit sha"
}
