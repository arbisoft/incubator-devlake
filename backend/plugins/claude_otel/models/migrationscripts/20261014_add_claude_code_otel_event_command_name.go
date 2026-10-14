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
	"encoding/json"
	"strings"

	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/migrationhelper"
)

var _ plugin.MigrationScript = (*addClaudeCodeOtelEventCommandName)(nil)

type addClaudeCodeOtelEventCommandName struct{}

const commandNameBackfillBatch = 1000

type otelEvent20261014CommandName struct {
	EventKey    []byte `gorm:"type:binary(32);primaryKey"`
	CommandName string `gorm:"type:varchar(255)"`
}

func (otelEvent20261014CommandName) TableName() string { return "_tool_claude_code_otel_events" }

type otelPromptEvent20261014 struct {
	EventKey   []byte
	Attributes json.RawMessage
}

// Up adds a typed command_name so the rollup can find /plan prompts without loading every
// prompt's attributes, and backfills it from the attributes of existing prompt events.
func (script *addClaudeCodeOtelEventCommandName) Up(basicRes context.BasicRes) errors.Error {
	if err := migrationhelper.AutoMigrateTables(basicRes, &otelEvent20261014CommandName{}); err != nil {
		return err
	}
	database := basicRes.GetDal()
	lastKey := []byte{}
	for {
		events := make([]otelPromptEvent20261014, 0, commandNameBackfillBatch)
		if err := database.All(&events,
			dal.Select("event_key, attributes"),
			dal.From("_tool_claude_code_otel_events"),
			dal.Where("event_name = ? AND event_key > ?", "user_prompt", lastKey),
			dal.Orderby("event_key ASC"),
			dal.Limit(commandNameBackfillBatch),
		); err != nil {
			return errors.Default.Wrap(err, "failed to load Claude Code OTel prompt events")
		}
		for _, event := range events {
			var attributes map[string]interface{}
			if json.Unmarshal(event.Attributes, &attributes) != nil {
				continue
			}
			commandName, _ := attributes["command_name"].(string)
			if commandName = strings.TrimSpace(commandName); commandName == "" {
				continue
			}
			if err := database.UpdateColumn(&otelEvent20261014CommandName{}, "command_name", commandName, dal.Where("event_key = ?", event.EventKey)); err != nil {
				return errors.Default.Wrap(err, "failed to backfill Claude Code OTel event command name")
			}
		}
		if len(events) < commandNameBackfillBatch {
			return nil
		}
		lastKey = events[len(events)-1].EventKey
	}
}

func (*addClaudeCodeOtelEventCommandName) Version() uint64 { return 20261014130000 }

func (*addClaudeCodeOtelEventCommandName) Name() string {
	return "add command name to claude code otel events"
}
