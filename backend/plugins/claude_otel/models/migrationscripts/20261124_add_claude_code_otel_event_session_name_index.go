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
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
)

var _ plugin.MigrationScript = (*addClaudeCodeOtelEventSessionNameIndex)(nil)

const (
	otelEventSessionNameIndex    = "idx_otel_event_session_name_time"
	addOtelEventSessionNameIndex = "ALTER TABLE _tool_claude_code_otel_events ADD INDEX " + otelEventSessionNameIndex +
		" (session_id, event_name, event_timestamp), ALGORITHM=INPLACE, LOCK=NONE"
)

// addClaudeCodeOtelEventSessionNameIndex builds the index online; it fails rather than lock or copy the table.
type addClaudeCodeOtelEventSessionNameIndex struct{}

func (*addClaudeCodeOtelEventSessionNameIndex) Up(basicRes context.BasicRes) errors.Error {
	db := basicRes.GetDal()
	existing, err := db.Count(dal.From("information_schema.STATISTICS"),
		dal.Where("TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?", "_tool_claude_code_otel_events", otelEventSessionNameIndex))
	if err != nil {
		return errors.Default.Wrap(err, "check claude code otel event session name index")
	}
	if existing > 0 {
		return nil
	}
	if err := db.Exec(addOtelEventSessionNameIndex); err != nil {
		return errors.Default.Wrap(err, "add claude code otel event session name index")
	}
	return nil
}

func (*addClaudeCodeOtelEventSessionNameIndex) Version() uint64 { return 20261124120000 }

func (*addClaudeCodeOtelEventSessionNameIndex) Name() string {
	return "add session and event name index to claude code otel events"
}
