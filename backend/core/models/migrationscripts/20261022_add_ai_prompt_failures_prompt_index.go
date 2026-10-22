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

var _ plugin.MigrationScript = (*addAiPromptFailuresPromptIndex)(nil)

// addAiPromptFailuresPromptIndex indexes ai_prompt_failures on (workspace_key, prompt_id),
// the key the prompt rollup deletes a prompt's failures by before rewriting them.
type addAiPromptFailuresPromptIndex struct{}

type aiPromptFailure20261022 struct {
	WorkspaceKey string `gorm:"type:varchar(255);index:idx_ai_prompt_failures_workspace_prompt,priority:1"`
	PromptId     string `gorm:"type:varchar(128);index:idx_ai_prompt_failures_workspace_prompt,priority:2"`
}

func (aiPromptFailure20261022) TableName() string { return "ai_prompt_failures" }

func (*addAiPromptFailuresPromptIndex) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &aiPromptFailure20261022{})
}

func (*addAiPromptFailuresPromptIndex) Version() uint64 { return 20261022120000 }

func (*addAiPromptFailuresPromptIndex) Name() string {
	return "add workspace and prompt index to AI prompt failures"
}
