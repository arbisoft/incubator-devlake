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

var _ plugin.MigrationScript = (*addAiPromptEffort)(nil)

// addAiPromptEffort records the reasoning effort each prompt ran at. The column is
// nullable: prompts that made no model request, prompts from clients that do not send
// effort, and every prompt converted before this change have none.
type addAiPromptEffort struct{}

type aiPrompt20261020 struct {
	Effort *string `gorm:"type:varchar(64);index"`
}

func (aiPrompt20261020) TableName() string { return "ai_prompts" }

func (*addAiPromptEffort) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &aiPrompt20261020{})
}

func (*addAiPromptEffort) Version() uint64 { return 20261020120000 }

func (*addAiPromptEffort) Name() string {
	return "add effort to AI prompts"
}
