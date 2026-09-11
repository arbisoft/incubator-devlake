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

	"github.com/apache/incubator-devlake/plugins/claude_enterprise/models"
	"github.com/stretchr/testify/require"
)

// TestValidateConnectionRequiresKeyAndOrganization covers validateConnection
// (0% in Phase 16), the guard PostConnections/PatchConnection both rely on.
func TestValidateConnectionRequiresKeyAndOrganization(t *testing.T) {
	require.Error(t, validateConnection(nil))

	require.Error(t, validateConnection(&models.ClaudeEnterpriseConnection{}), "missing AnalyticsApiKey must fail")

	require.Error(t, validateConnection(&models.ClaudeEnterpriseConnection{
		ClaudeEnterpriseConn: models.ClaudeEnterpriseConn{AnalyticsApiKey: "sk-ant-api01-synthetic"},
	}), "missing OrganizationId must fail")

	require.NoError(t, validateConnection(&models.ClaudeEnterpriseConnection{
		ClaudeEnterpriseConn: models.ClaudeEnterpriseConn{
			AnalyticsApiKey: "sk-ant-api01-synthetic",
			OrganizationId:  "org_synthetic_001",
		},
	}))
}
