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

var _ plugin.MigrationScript = (*addClaudeCodeOtelReplayLogCounts)(nil)

// addClaudeCodeOtelReplayLogCounts counts replayed and skipped log batches apart from the
// metric batches in replayed_batches and skipped_batches.
type addClaudeCodeOtelReplayLogCounts struct{}

type otelReplayRequest20261013 struct {
	ReplayedLogBatches int `gorm:"not null;default:0"`
	SkippedLogBatches  int `gorm:"not null;default:0"`
}

func (otelReplayRequest20261013) TableName() string {
	return "_tool_claude_code_otel_replay_requests"
}

func (*addClaudeCodeOtelReplayLogCounts) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &otelReplayRequest20261013{})
}

func (*addClaudeCodeOtelReplayLogCounts) Version() uint64 { return 20261013140000 }

func (*addClaudeCodeOtelReplayLogCounts) Name() string {
	return "add log batch counts to claude code otel replay requests"
}
