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
	coreModels "github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/core/plugin"
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
	"github.com/apache/incubator-devlake/plugins/aws/models/migrationscripts"
	"github.com/apache/incubator-devlake/plugins/aws/tasks"
)

// make sure interface is implemented
var _ plugin.PluginMeta = (*Aws)(nil)
var _ plugin.PluginInit = (*Aws)(nil)
var _ plugin.PluginTask = (*Aws)(nil)
var _ plugin.PluginApi = (*Aws)(nil)
var _ plugin.DataSourcePluginBlueprintV200 = (*Aws)(nil)
var _ plugin.PluginSource = (*Aws)(nil)
var _ plugin.PluginMigration = (*Aws)(nil)

type Aws struct{}

func (p Aws) Name() string {
	return "aws"
}

func (p Aws) Description() string {
	return "collect AWS CodePipeline, CodeBuild and cost data"
}

func (p Aws) Init(br context.BasicRes) errors.Error {
	api.Init(br, &p)
	return nil
}

func (p Aws) Connection() dal.Tabler {
	return &models.AwsConnection{}
}

func (p Aws) Scope() plugin.ToolLayerScope {
	return &models.AwsPipeline{}
}

func (p Aws) ScopeConfig() dal.Tabler {
	return &models.AwsScopeConfig{}
}

func (p Aws) GetTablesInfo() []dal.Tabler {
	return []dal.Tabler{
		&models.AwsConnection{},
		&models.AwsPipeline{},
		&models.AwsScopeConfig{},
	}
}

func (p Aws) SubTaskMetas() []plugin.SubTaskMeta {
	return []plugin.SubTaskMeta{}
}

func (p Aws) MakeDataSourcePipelinePlanV200(
	connectionId uint64,
	scopes []*coreModels.BlueprintScope,
) (pp coreModels.PipelinePlan, sc []plugin.Scope, err errors.Error) {
	return api.MakeDataSourcePipelinePlanV200(p.SubTaskMetas(), connectionId, scopes)
}

func (p Aws) PrepareTaskData(taskCtx plugin.TaskContext, options map[string]interface{}) (interface{}, errors.Error) {
	op, err := tasks.DecodeAndValidateTaskOptions(options)
	if err != nil {
		return nil, err
	}
	connection := &models.AwsConnection{}
	err = helper.NewConnectionHelper(taskCtx, nil, p.Name()).FirstById(connection, op.ConnectionId)
	if err != nil {
		return nil, errors.Default.Wrap(err, "unable to get AWS connection by the given connection ID")
	}
	return &tasks.AwsTaskData{Options: op, Connection: connection}, nil
}

// RootPkgPath PkgPath information lost when compiled as plugin(.so)
func (p Aws) RootPkgPath() string {
	return "github.com/apache/incubator-devlake/plugins/aws"
}

func (p Aws) MigrationScripts() []plugin.MigrationScript {
	return migrationscripts.All()
}

func (p Aws) ApiResources() map[string]map[string]plugin.ApiResourceHandler {
	return map[string]map[string]plugin.ApiResourceHandler{
		"test": {
			"POST": api.TestConnection,
		},
		"connections": {
			"POST": api.PostConnections,
			"GET":  api.ListConnections,
		},
		"connections/:connectionId": {
			"GET":    api.GetConnection,
			"PATCH":  api.PatchConnection,
			"DELETE": api.DeleteConnection,
		},
		"connections/:connectionId/test": {
			"POST": api.TestExistingConnection,
		},
		"connections/:connectionId/setup": {
			"GET": api.GetSetup,
		},
		"connections/:connectionId/remote-scopes": {
			"GET": api.RemoteScopes,
		},
		"connections/:connectionId/scopes/:scopeId": {
			"GET":    api.GetScope,
			"PATCH":  api.PatchScope,
			"DELETE": api.DeleteScope,
		},
		"connections/:connectionId/scopes/:scopeId/latest-sync-state": {
			"GET": api.GetScopeLatestSyncState,
		},
		"connections/:connectionId/scopes": {
			"GET": api.GetScopes,
			"PUT": api.PutScopes,
		},
		"connections/:connectionId/scope-configs": {
			"POST": api.PostScopeConfig,
			"GET":  api.GetScopeConfigList,
		},
		"connections/:connectionId/scope-configs/:scopeConfigId": {
			"PATCH":  api.PatchScopeConfig,
			"GET":    api.GetScopeConfig,
			"DELETE": api.DeleteScopeConfig,
		},
		"scope-config/:scopeConfigId/projects": {
			"GET": api.GetProjectsByScopeConfig,
		},
	}
}
