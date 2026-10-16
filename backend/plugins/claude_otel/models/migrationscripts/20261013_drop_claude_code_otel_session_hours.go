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

var _ plugin.MigrationScript = (*dropClaudeCodeOtelSessionHours)(nil)

// dropClaudeCodeOtelSessionHours removes the per-session hourly table that earlier builds
// of this branch created; prompt events now carry the session id. The drop is a no-op
// where it never existed.
type dropClaudeCodeOtelSessionHours struct{}

func (*dropClaudeCodeOtelSessionHours) Up(basicRes context.BasicRes) errors.Error {
	return basicRes.GetDal().DropTables("_tool_claude_code_otel_session_hours")
}

func (*dropClaudeCodeOtelSessionHours) Version() uint64 { return 20261013120000 }

func (*dropClaudeCodeOtelSessionHours) Name() string { return "drop claude code otel session hours" }
