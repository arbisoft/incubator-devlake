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

package models

import (
	"testing"

	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/stretchr/testify/require"
)

// TestClaudeEnterpriseScopeIdentityMethods covers ScopeId/ScopeName/
// ScopeFullName/ScopeParams, which were 0% in Phase 16 because nothing
// exercised plugin.ToolLayerScope's identity methods directly.
func TestClaudeEnterpriseScopeIdentityMethods(t *testing.T) {
	named := ClaudeEnterpriseScope{
		Scope:          common.Scope{ConnectionId: 1},
		Id:             "org_synthetic_001",
		OrganizationId: "org_synthetic_001",
		Name:           "Synthetic Org",
	}
	require.Equal(t, "org_synthetic_001", named.ScopeId())
	require.Equal(t, "Synthetic Org", named.ScopeName())
	require.Equal(t, "Synthetic Org", named.ScopeFullName())

	params, ok := named.ScopeParams().(*ClaudeEnterpriseScopeParams)
	require.True(t, ok)
	require.Equal(t, uint64(1), params.ConnectionId)
	require.Equal(t, "org_synthetic_001", params.ScopeId)
	require.Equal(t, "org_synthetic_001", params.OrganizationId)

	unnamed := ClaudeEnterpriseScope{Id: "org_synthetic_002"}
	require.Equal(t, "org_synthetic_002", unnamed.ScopeName(), "ScopeName must fall back to Id when Name is blank")
	require.Equal(t, "org_synthetic_002", unnamed.ScopeFullName())
}

func TestClaudeEnterpriseScopeConfigGetConnectionId(t *testing.T) {
	scopeConfig := ClaudeEnterpriseScopeConfig{
		ScopeConfig: common.ScopeConfig{ConnectionId: 7},
	}
	require.Equal(t, uint64(7), scopeConfig.GetConnectionId())
}
