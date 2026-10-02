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

package api

import (
	"testing"

	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/unithelper"
	contextimpl "github.com/apache/incubator-devlake/impls/context"
	mockdal "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_enterprise/models"
	"github.com/spf13/viper"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// setupApiHelpersForTest re-runs Init (see TestInitWiresPackageLevelHelpers)
// against the given Dal so this file's tests drive the real, unexported
// package-level connectionHelper the connection.go handlers depend on,
// instead of duplicating its wiring.
func setupApiHelpersForTest(mockDal *mockdal.Dal) {
	mockDal.On("GetColumns", mock.Anything, mock.Anything).Return(nil, nil).Maybe()
	basicRes := contextimpl.NewDefaultBasicRes(viper.New(), unithelper.DummyLogger(), mockDal)
	Init(basicRes, fakePluginMeta{})
}

// TestPostConnectionsCreatesConnection drives PostConnections (0% in
// Phase 16) through its real validation + create path.
func TestPostConnectionsCreatesConnection(t *testing.T) {
	mockDal := new(mockdal.Dal)
	mockDal.On("Create", mock.Anything, mock.Anything).Return(nil)
	setupApiHelpersForTest(mockDal)

	output, err := PostConnections(&plugin.ApiResourceInput{
		Body: map[string]interface{}{
			"name":           "Synthetic Claude Enterprise",
			"endpoint":       "https://api.anthropic.com/v1",
			"token":          "sk-ant-api01-synthetic",
			"organizationId": "org_synthetic_001",
		},
	})
	require.NoError(t, err)
	require.NotNil(t, output)
	connection, ok := output.Body.(models.ClaudeEnterpriseConnection)
	require.True(t, ok)
	require.Equal(t, "org_synthetic_001", connection.OrganizationId)
	require.NotEqual(t, "sk-ant-api01-synthetic", connection.AnalyticsApiKey, "the response must never echo the raw key")
}

// TestPostConnectionsRejectsMissingOrganizationId asserts validateConnection's
// real guard is wired into the handler, not only unit-tested in isolation.
func TestPostConnectionsRejectsMissingOrganizationId(t *testing.T) {
	mockDal := new(mockdal.Dal)
	setupApiHelpersForTest(mockDal)

	_, err := PostConnections(&plugin.ApiResourceInput{
		Body: map[string]interface{}{
			"endpoint": "https://api.anthropic.com/v1",
			"token":    "sk-ant-api01-synthetic",
		},
	})
	require.Error(t, err)
}

// TestGetConnectionReturnsSanitizedConnection drives GetConnection (0% in
// Phase 16), asserting the stored secret is redacted on the way out.
func TestGetConnectionReturnsSanitizedConnection(t *testing.T) {
	mockDal := new(mockdal.Dal)
	mockDal.On("First", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		dst := args.Get(0).(*models.ClaudeEnterpriseConnection)
		dst.OrganizationId = "org_synthetic_001"
		dst.AnalyticsApiKey = "sk-ant-api01-synthetic"
	}).Return(nil)
	setupApiHelpersForTest(mockDal)

	output, err := GetConnection(&plugin.ApiResourceInput{Params: map[string]string{"connectionId": "1"}})
	require.NoError(t, err)
	connection, ok := output.Body.(models.ClaudeEnterpriseConnection)
	require.True(t, ok)
	require.NotEqual(t, "sk-ant-api01-synthetic", connection.AnalyticsApiKey, "GetConnection must never return the raw secret")
}

// TestListConnectionsReturnsSanitizedConnections drives ListConnections (0%
// in Phase 16), asserting every returned connection is sanitized, not just
// the first.
func TestListConnectionsReturnsSanitizedConnections(t *testing.T) {
	mockDal := new(mockdal.Dal)
	mockDal.On("All", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		dst := args.Get(0).(*[]models.ClaudeEnterpriseConnection)
		*dst = []models.ClaudeEnterpriseConnection{{
			ClaudeEnterpriseConn: models.ClaudeEnterpriseConn{
				AnalyticsApiKey: "sk-ant-api01-synthetic",
				OrganizationId:  "org_synthetic_001",
			},
		}}
	}).Return(nil)
	setupApiHelpersForTest(mockDal)

	output, err := ListConnections(&plugin.ApiResourceInput{})
	require.NoError(t, err)
	connections, ok := output.Body.([]models.ClaudeEnterpriseConnection)
	require.True(t, ok)
	require.Len(t, connections, 1)
	require.NotEqual(t, "sk-ant-api01-synthetic", connections[0].AnalyticsApiKey)
}

// TestPatchConnectionUpdatesFields drives PatchConnection (0% in Phase 16)
// through its real load -> merge -> normalize -> validate -> save path.
func TestPatchConnectionUpdatesFields(t *testing.T) {
	mockDal := new(mockdal.Dal)
	mockDal.On("First", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		dst := args.Get(0).(*models.ClaudeEnterpriseConnection)
		dst.Endpoint = "https://api.anthropic.com/v1"
		dst.AnalyticsApiKey = "sk-ant-api01-original"
		dst.OrganizationId = "org_synthetic_001"
	}).Return(nil)
	mockDal.On("CreateOrUpdate", mock.Anything, mock.Anything).Return(nil)
	setupApiHelpersForTest(mockDal)

	output, err := PatchConnection(&plugin.ApiResourceInput{
		Params: map[string]string{"connectionId": "1"},
		Body:   map[string]interface{}{"organizationId": "org_synthetic_002"},
	})
	require.NoError(t, err)
	connection, ok := output.Body.(models.ClaudeEnterpriseConnection)
	require.True(t, ok)
	require.Equal(t, "org_synthetic_002", connection.OrganizationId)
}
