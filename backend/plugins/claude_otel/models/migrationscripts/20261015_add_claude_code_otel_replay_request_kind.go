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
	"github.com/apache/incubator-devlake/core/models/migrationscripts/archived"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/migrationhelper"
)

var _ plugin.MigrationScript = (*addClaudeCodeOtelReplayRequestKind)(nil)

// addClaudeCodeOtelReplayRequestKind lets a replay request target log batches. Existing
// requests default to metrics, the only kind there was.
type addClaudeCodeOtelReplayRequestKind struct{}

type otelReplayRequest20261015 struct {
	archived.Model
	Kind string `gorm:"type:varchar(16);not null;default:'metrics'"`
}

func (otelReplayRequest20261015) TableName() string {
	return "_tool_claude_code_otel_replay_requests"
}

func (script *addClaudeCodeOtelReplayRequestKind) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &otelReplayRequest20261015{})
}

func (*addClaudeCodeOtelReplayRequestKind) Version() uint64 { return 20261015120000 }

func (*addClaudeCodeOtelReplayRequestKind) Name() string {
	return "add kind to claude code otel replay requests"
}
