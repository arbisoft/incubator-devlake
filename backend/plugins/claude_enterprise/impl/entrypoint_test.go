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
	"testing"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/helpers/unithelper"
	contextimpl "github.com/apache/incubator-devlake/impls/context"
	mockdal "github.com/apache/incubator-devlake/mocks/core/dal"
	mockplugin "github.com/apache/incubator-devlake/mocks/core/plugin"
	"github.com/apache/incubator-devlake/plugins/claude_enterprise/models"
	"github.com/apache/incubator-devlake/plugins/claude_enterprise/tasks"
	"github.com/spf13/viper"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// TestClaudeEnterpriseMetadata drives the plugin.PluginMeta identity methods
// (0% in Phase 16 because nothing ever called them directly).
func TestClaudeEnterpriseMetadata(t *testing.T) {
	p := ClaudeEnterprise{}
	require.Equal(t, "claude_enterprise", p.Name())
	require.NotEmpty(t, p.Description())
	require.Equal(t, "github.com/apache/incubator-devlake/plugins/claude_enterprise", p.RootPkgPath())
	require.IsType(t, &models.ClaudeEnterpriseConnection{}, p.Connection())
	require.IsType(t, &models.ClaudeEnterpriseScope{}, p.Scope())
	require.IsType(t, &models.ClaudeEnterpriseScopeConfig{}, p.ScopeConfig())
}

// TestClaudeEnterpriseCloseIsNoOp asserts CloseablePluginTask.Close is a real,
// intentional no-op (the plugin owns no shared task-level resources) rather
// than an unimplemented stub -- taskCtx is genuinely unused, so nil is safe.
func TestClaudeEnterpriseCloseIsNoOp(t *testing.T) {
	require.NoError(t, (ClaudeEnterprise{}).Close(nil))
}

func TestNormalizeConnectionDelegatesToConnectionNormalize(t *testing.T) {
	connection := &models.ClaudeEnterpriseConnection{}
	NormalizeConnection(connection)
	require.Equal(t, models.DefaultEndpoint, connection.Endpoint)
	require.Equal(t, models.DefaultRateLimitPerHour, connection.RateLimitPerHour)
}

// TestClaudeEnterpriseInitWiresApiHelpers drives PluginInit.Init (0% in
// Phase 16) with a real BasicRes (DevLake's own impls/context.DefaultBasicRes)
// backed by a mocked Dal -- api.Init only wires helper constructors, none of
// which touch the database at construction time.
func TestClaudeEnterpriseInitWiresApiHelpers(t *testing.T) {
	mockDal := new(mockdal.Dal)
	// srvhelper.NewModelSrvHelper reads each model's primary-key columns at
	// construction time; an empty result is a valid, real answer for a
	// database that was never migrated in this test.
	mockDal.On("GetColumns", mock.Anything, mock.Anything).Return(nil, nil)
	basicRes := contextimpl.NewDefaultBasicRes(viper.New(), unithelper.DummyLogger(), mockDal)
	require.NoError(t, (ClaudeEnterprise{}).Init(basicRes))
}

// TestPrepareTaskDataBuildsTaskDataFromConnection drives PrepareTaskData's
// success path: decode options, look up the connection, normalize it, and
// fall back to the connection's OrganizationId when the task options omit
// one.
func TestPrepareTaskDataBuildsTaskDataFromConnection(t *testing.T) {
	mockDal := new(mockdal.Dal)
	mockDal.On("First", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		dst := args.Get(0).(*models.ClaudeEnterpriseConnection)
		dst.OrganizationId = "org_synthetic_001"
	}).Return(nil)

	mockTaskCtx := new(mockplugin.TaskContext)
	mockTaskCtx.On("GetConfig", mock.Anything).Return("")
	mockTaskCtx.On("GetLogger").Return(unithelper.DummyLogger())
	mockTaskCtx.On("GetDal").Return(mockDal)

	data, err := (ClaudeEnterprise{}).PrepareTaskData(mockTaskCtx, map[string]interface{}{
		"connectionId": uint64(1),
	})
	require.NoError(t, err)
	taskData, ok := data.(*tasks.ClaudeEnterpriseTaskData)
	require.True(t, ok)
	require.Equal(t, uint64(1), taskData.Options.ConnectionId)
	require.Equal(t, "org_synthetic_001", taskData.Options.OrganizationId, "OrganizationId must fall back to the connection's value when task options omit it")
	require.Equal(t, models.DefaultEndpoint, taskData.Connection.Endpoint, "connection must be normalized")
}

// TestPrepareTaskDataSurfacesMissingConnection asserts a connection lookup
// failure is returned as a real error rather than a nil task data value.
func TestPrepareTaskDataSurfacesMissingConnection(t *testing.T) {
	mockDal := new(mockdal.Dal)
	mockDal.On("First", mock.Anything, mock.Anything).Return(errors.Default.New("connection not found"))

	mockTaskCtx := new(mockplugin.TaskContext)
	mockTaskCtx.On("GetConfig", mock.Anything).Return("")
	mockTaskCtx.On("GetLogger").Return(unithelper.DummyLogger())
	mockTaskCtx.On("GetDal").Return(mockDal)

	data, err := (ClaudeEnterprise{}).PrepareTaskData(mockTaskCtx, map[string]interface{}{
		"connectionId": uint64(99),
	})
	require.Error(t, err)
	require.Nil(t, data)
}
