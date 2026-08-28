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

package impl

import (
	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/plugins/claude_otel/api"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models/migrationscripts"
)

var _ interface {
	plugin.PluginMeta
	plugin.PluginInit
	plugin.PluginApi
	plugin.PluginModel
	plugin.PluginMigration
} = (*ClaudeOtel)(nil)

type ClaudeOtel struct{}

func (p ClaudeOtel) Name() string { return "claude_otel" }

func (p ClaudeOtel) Description() string {
	return "Manage Claude Code OpenTelemetry credentials"
}

func (p ClaudeOtel) RootPkgPath() string {
	return "github.com/apache/incubator-devlake/plugins/claude_otel"
}

func (p ClaudeOtel) Init(basicRes context.BasicRes) errors.Error {
	api.Init(basicRes)
	return nil
}

func (p ClaudeOtel) GetTablesInfo() []dal.Tabler { return models.GetTablesInfo() }

func (p ClaudeOtel) MigrationScripts() []plugin.MigrationScript { return migrationscripts.All() }

func (p ClaudeOtel) ApiResources() map[string]map[string]plugin.ApiResourceHandler {
	return map[string]map[string]plugin.ApiResourceHandler{
		"connections": {
			"GET":  api.ListConnections,
			"POST": api.PostConnection,
		},
		"projects": {
			"GET": api.ListProjects,
		},
		"projects/:projectName/connections": {
			"GET": api.ListProjectConnections,
		},
		"projects/:projectName/removal-preflight": {
			"POST": api.ValidateProjectRemoval,
		},
		"projects/:projectName/placements": {
			"DELETE": api.DeleteProjectPlacements,
		},
		"connections/:connectionId/projects": {
			"PUT": api.PutConnectionProjects,
		},
		"connections/:connectionId/rotate": {
			"POST": api.RotateConnection,
		},
		"connections/:connectionId/revoke": {
			"POST": api.RevokeConnection,
		},
		"connections/:connectionId/hide": {
			"POST": api.HideConnection,
		},
		"connections/:connectionId/finalize-rotation": {
			"POST": api.FinalizeRotation,
		},
		"connections/:connectionId/apply": {
			"POST": api.ApplyConnection,
		},
	}
}
