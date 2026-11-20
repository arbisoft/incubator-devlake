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

var _ plugin.MigrationScript = (*addAiPromptFailures)(nil)

// addAiPromptFailures adds one row per failed model request or tool call of a prompt, with
// the failure's reason. The schema is frozen here.
type addAiPromptFailures struct{}

type aiPromptFailure20261021 struct {
	archived.DomainEntity
	Provider     string    `gorm:"type:varchar(100);index"`
	WorkspaceKey string    `gorm:"type:varchar(255);index"`
	UserKey      string    `gorm:"type:varchar(255);index"`
	UserEmail    string    `gorm:"type:varchar(255);index"`
	SessionId    string    `gorm:"type:varchar(128);index"`
	PromptId     string    `gorm:"type:varchar(128);index"`
	AiPromptId   string    `gorm:"type:varchar(255);index"`
	FailureKind  string    `gorm:"type:varchar(32);index"`
	OccurredAt   time.Time `gorm:"type:datetime(3);index"`
	Model        string    `gorm:"type:varchar(255)"`
	QuerySource  string    `gorm:"type:varchar(100)"`
	ToolName     string    `gorm:"type:varchar(255);index"`
	ErrorType    string    `gorm:"type:varchar(255);index"`
	ErrorMessage string    `gorm:"type:varchar(1024)"`
	StatusCode   *int64
	Attempt      *int64
	DurationMs   *int64
}

func (aiPromptFailure20261021) TableName() string { return "ai_prompt_failures" }

func (*addAiPromptFailures) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &aiPromptFailure20261021{})
}

func (*addAiPromptFailures) Version() uint64 { return 20261021120000 }

func (*addAiPromptFailures) Name() string {
	return "add AI prompt failures table"
}
