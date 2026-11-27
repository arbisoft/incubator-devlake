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
	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/migrationhelper"
)

var _ plugin.MigrationScript = (*addAiDailyFactsRepositoryUrl)(nil)

// addAiDailyFactsRepositoryUrl records the repository of each daily AI fact. NULL means the
// provider can't report a repository; existing Claude OTel rows get an empty string.
type addAiDailyFactsRepositoryUrl struct{}

type aiActivity20261127 struct {
	RepositoryUrl *string `gorm:"type:varchar(255)"`
}

func (aiActivity20261127) TableName() string { return "ai_activities" }

type aiModelUsage20261127 struct {
	RepositoryUrl *string `gorm:"type:varchar(255)"`
}

func (aiModelUsage20261127) TableName() string { return "ai_model_usages" }

type aiToolDecision20261127 struct {
	RepositoryUrl *string `gorm:"type:varchar(255)"`
}

func (aiToolDecision20261127) TableName() string { return "ai_tool_decisions" }

func (*addAiDailyFactsRepositoryUrl) Up(basicRes context.BasicRes) errors.Error {
	if err := migrationhelper.AutoMigrateTables(basicRes, &aiActivity20261127{}, &aiModelUsage20261127{}, &aiToolDecision20261127{}); err != nil {
		return err
	}
	db := basicRes.GetDal()
	statements := []struct {
		query, what string
	}{
		{"UPDATE ai_activities SET repository_url = '' WHERE repository_url IS NULL AND provider = 'claude' AND record_kind = 'canonical_activity'", "backfill repository url on claude AI activities"},
		{"UPDATE ai_model_usages SET repository_url = '' WHERE repository_url IS NULL AND provider = 'claude'", "backfill repository url on claude AI model usages"},
		{"UPDATE ai_tool_decisions SET repository_url = '' WHERE repository_url IS NULL AND provider = 'claude'", "backfill repository url on claude AI tool decisions"},
	}
	for _, statement := range statements {
		if err := db.Exec(statement.query); err != nil {
			return errors.Default.Wrap(err, statement.what)
		}
	}
	return nil
}

func (*addAiDailyFactsRepositoryUrl) Version() uint64 { return 20261127120000 }

func (*addAiDailyFactsRepositoryUrl) Name() string {
	return "add repository url to AI daily facts"
}
