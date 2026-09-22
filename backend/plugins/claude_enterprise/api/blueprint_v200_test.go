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

	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/srvhelper"
	"github.com/apache/incubator-devlake/plugins/claude_enterprise/models"
	"github.com/stretchr/testify/require"
)

func TestPhase5BlueprintPlanHonorsScopeConfigCrossEntities(t *testing.T) {
	metas := []plugin.SubTaskMeta{
		{Name: "collectCross", EnabledByDefault: true, DomainTypes: []string{plugin.DOMAIN_TYPE_CROSS}},
		{Name: "extractCross", EnabledByDefault: true, DomainTypes: []string{plugin.DOMAIN_TYPE_CROSS}},
		{Name: "collectCode", EnabledByDefault: true, DomainTypes: []string{plugin.DOMAIN_TYPE_CODE}},
	}
	scopeDetails := []*srvhelper.ScopeDetail[models.ClaudeEnterpriseScope, models.ClaudeEnterpriseScopeConfig]{
		{
			Scope: models.ClaudeEnterpriseScope{
				Scope:          common.Scope{ConnectionId: 1, ScopeConfigId: 10},
				Id:             "scope_org_synthetic_001",
				OrganizationId: "org_synthetic_001",
			},
			ScopeConfig: &models.ClaudeEnterpriseScopeConfig{
				ScopeConfig: common.ScopeConfig{
					Entities: []string{plugin.DOMAIN_TYPE_CROSS},
				},
			},
		},
	}

	plan, err := makeDataSourcePipelinePlanV200(metas, scopeDetails)
	require.NoError(t, err)
	require.Len(t, plan, 1)
	require.Len(t, plan[0], 1)
	require.Equal(t, "claude_enterprise", plan[0][0].Plugin)
	require.Equal(t, []string{"collectCross", "extractCross"}, plan[0][0].Subtasks)
}
