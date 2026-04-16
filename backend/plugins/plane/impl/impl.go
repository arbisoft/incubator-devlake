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
	"fmt"

	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	coreModels "github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/core/plugin"
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/plane/api"
	"github.com/apache/incubator-devlake/plugins/plane/models"
	"github.com/apache/incubator-devlake/plugins/plane/models/migrationscripts"
	"github.com/apache/incubator-devlake/plugins/plane/tasks"
)

var _ interface {
	plugin.PluginMeta
	plugin.PluginInit
	plugin.PluginTask
	plugin.PluginApi
	plugin.PluginModel
	plugin.PluginMigration
	plugin.CloseablePluginTask
	plugin.PluginSource
} = (*Plane)(nil)

type Plane struct{}

func (p Plane) Connection() dal.Tabler {
	return &models.PlaneConnection{}
}

func (p Plane) Scope() plugin.ToolLayerScope {
	return nil
}

func (p Plane) ScopeConfig() dal.Tabler {
	return nil
}

func (p Plane) Init(basicRes context.BasicRes) errors.Error {
	api.Init(basicRes, p)
	return nil
}

func (p Plane) GetTablesInfo() []dal.Tabler {
	return []dal.Tabler{
		&models.PlaneConnection{},
	}
}

func (p Plane) Description() string {
	return "To collect and enrich data from Plane.so"
}

func (p Plane) Name() string {
	return "plane"
}

func (p Plane) SubTaskMetas() []plugin.SubTaskMeta {
	return []plugin.SubTaskMeta{}
}

func (p Plane) PrepareTaskData(taskCtx plugin.TaskContext, options map[string]interface{}) (interface{}, errors.Error) {
	var op tasks.PlaneOptions
	logger := taskCtx.GetLogger()
	logger.Debug("%v", options)

	if err := helper.Decode(options, &op, nil); err != nil {
		return nil, errors.Default.Wrap(err, "could not decode plane options")
	}
	if op.ConnectionId == 0 {
		return nil, errors.BadInput.New("plane connectionId is invalid")
	}
	if op.ProjectId == "" {
		return nil, errors.BadInput.New("plane projectId is required")
	}

	connection := &models.PlaneConnection{}
	connectionHelper := helper.NewConnectionHelper(taskCtx, nil, p.Name())
	if err := connectionHelper.FirstById(connection, op.ConnectionId); err != nil {
		return nil, errors.Default.Wrap(err, "unable to get plane connection")
	}
	if connection.WorkspaceSlug == "" {
		return nil, errors.BadInput.New("plane workspaceSlug is required")
	}

	planeApiClient, err := tasks.NewPlaneApiClient(taskCtx, connection)
	if err != nil {
		return nil, errors.Default.Wrap(err, "failed to create plane api client")
	}

	taskData := &tasks.PlaneTaskData{
		Options:   &op,
		ApiClient: planeApiClient,
	}
	return taskData, nil
}

func (p Plane) RootPkgPath() string {
	return "github.com/apache/incubator-devlake/plugins/plane"
}

func (p Plane) MigrationScripts() []plugin.MigrationScript {
	return migrationscripts.All()
}

func (p Plane) ApiResources() map[string]map[string]plugin.ApiResourceHandler {
	return map[string]map[string]plugin.ApiResourceHandler{
		"test": {
			"POST": api.TestConnection,
		},
		"connections": {
			"POST": api.PostConnections,
			"GET":  api.ListConnections,
		},
		"connections/:connectionId": {
			"PATCH":  api.PatchConnection,
			"DELETE": api.DeleteConnection,
			"GET":    api.GetConnection,
		},
		"connections/:connectionId/test": {
			"POST": api.TestExistingConnection,
		},
	}
}

func (p Plane) Close(taskCtx plugin.TaskContext) errors.Error {
	data, ok := taskCtx.GetData().(*tasks.PlaneTaskData)
	if !ok {
		return errors.Default.New(fmt.Sprintf("GetData failed when try to close %+v", taskCtx))
	}
	if data.ApiClient != nil {
		data.ApiClient.Release()
	}
	return nil
}

func (p Plane) MakeDataSourcePipelinePlanV200(
	connectionId uint64,
	scopes []*coreModels.BlueprintScope,
) (coreModels.PipelinePlan, []plugin.Scope, errors.Error) {
	return nil, nil, errors.BadInput.New("plane blueprint planning is not available until scope support is added")
}
