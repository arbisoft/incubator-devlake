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

	apihelper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	dsmodels "github.com/apache/incubator-devlake/helpers/pluginhelper/api/models"
	"github.com/apache/incubator-devlake/plugins/claude_enterprise/models"
	"github.com/stretchr/testify/require"
)

func TestPhase8RemoteScopesReturnsSingleDeterministicOrganizationScope(t *testing.T) {
	connection := &models.ClaudeEnterpriseConnection{
		ClaudeEnterpriseConn: models.ClaudeEnterpriseConn{
			OrganizationId: " org_synthetic_001 ",
		},
	}

	children, nextPage, err := listClaudeEnterpriseRemoteScopes(connection, nil, "", ClaudeEnterpriseRemotePagination{})

	require.NoError(t, err)
	require.Nil(t, nextPage)
	require.Len(t, children, 1)
	require.Equal(t, apihelper.RAS_ENTRY_TYPE_SCOPE, children[0].Type)
	require.Equal(t, "org_synthetic_001", children[0].Id)
	require.Equal(t, "org_synthetic_001", children[0].Name)
	require.Equal(t, "org_synthetic_001", children[0].FullName)
	require.Equal(t, "org_synthetic_001", children[0].Data.Id)
	require.Equal(t, "org_synthetic_001", children[0].Data.OrganizationId)
	require.Equal(t, "org_synthetic_001", children[0].Data.Name)
}

func TestPhase8RemoteScopesRequireOrganizationId(t *testing.T) {
	children, nextPage, err := listClaudeEnterpriseRemoteScopes(&models.ClaudeEnterpriseConnection{}, nil, "", ClaudeEnterpriseRemotePagination{})

	require.NoError(t, err)
	require.Nil(t, nextPage)
	require.Empty(t, children)
}

func TestPhase8SearchRemoteScopesIsSafeWithoutConnectionContext(t *testing.T) {
	children, err := searchClaudeEnterpriseRemoteScopes(nil, &dsmodels.DsRemoteApiScopeSearchParams{Search: "org_synthetic_001"})

	require.NoError(t, err)
	require.Empty(t, children)
}
