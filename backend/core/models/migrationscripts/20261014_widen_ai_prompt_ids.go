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
)

var _ plugin.MigrationScript = (*widenAiPromptIds)(nil)

// widenAiPromptIds matches the ai_* session and prompt ids to the 128 characters the
// Claude Code event table accepts, so a longer id cannot fail the prompt rollup.
type widenAiPromptIds struct{}

func (script *widenAiPromptIds) Up(basicRes context.BasicRes) errors.Error {
	db := basicRes.GetDal()
	for _, column := range []struct{ table, name string }{
		{"ai_prompts", "session_id"},
		{"ai_prompts", "prompt_id"},
		{"ai_prompt_skills", "session_id"},
		{"ai_prompt_skills", "prompt_id"},
		{"ai_permission_mode_changes", "session_id"},
	} {
		if err := db.ModifyColumnType(column.table, column.name, "varchar(128)"); err != nil {
			return err
		}
	}
	return nil
}

func (*widenAiPromptIds) Version() uint64 {
	return 20261014140000
}

func (*widenAiPromptIds) Name() string {
	return "widen ai prompt session and prompt ids to 128"
}
