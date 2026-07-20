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
	"encoding/json"
	"net/http"
	"testing"

	"github.com/apache/incubator-devlake/core/utils"
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/stretchr/testify/require"
)

func TestClaudeEnterpriseConnectionDefaults(t *testing.T) {
	connection := &ClaudeEnterpriseConnection{}

	connection.Normalize()

	require.Equal(t, DefaultEndpoint, connection.Endpoint)
	require.Equal(t, DefaultRateLimitPerHour, connection.RateLimitPerHour)
}

func TestClaudeEnterpriseConnectionNormalizeTrimsEndpointAndOrganization(t *testing.T) {
	connection := &ClaudeEnterpriseConnection{
		ClaudeEnterpriseConn: ClaudeEnterpriseConn{
			RestConnection: helper.RestConnection{
				Endpoint: " https://api.anthropic.com/v1/ ",
			},
			OrganizationId:   " org_123 ",
			RateLimitPerHour: 120,
		},
	}

	connection.Normalize()

	require.Equal(t, "https://api.anthropic.com/v1", connection.Endpoint)
	require.Equal(t, "org_123", connection.OrganizationId)
	require.Equal(t, 120, connection.RateLimitPerHour)
}

func TestClaudeEnterpriseAuthenticationHeaders(t *testing.T) {
	req, err := http.NewRequest(http.MethodGet, DefaultEndpoint, nil)
	require.NoError(t, err)

	conn := &ClaudeEnterpriseConn{AnalyticsApiKey: " analytics-key "}
	require.Nil(t, conn.SetupAuthentication(req))

	require.Equal(t, "analytics-key", req.Header.Get("x-api-key"))
	require.Equal(t, AnthropicVersion, req.Header.Get("anthropic-version"))
}

func TestClaudeEnterpriseAuthenticationRequiresKey(t *testing.T) {
	req, err := http.NewRequest(http.MethodGet, DefaultEndpoint, nil)
	require.NoError(t, err)

	err = (&ClaudeEnterpriseConn{}).SetupAuthentication(req)
	require.NotNil(t, err)
	require.Contains(t, err.Error(), "analyticsApiKey is required")
}

func TestClaudeEnterpriseConnectionSanitizeRedactsKey(t *testing.T) {
	connection := ClaudeEnterpriseConnection{
		ClaudeEnterpriseConn: ClaudeEnterpriseConn{AnalyticsApiKey: "secret"},
	}

	sanitized := connection.Sanitize()

	require.NotEqual(t, "secret", sanitized.AnalyticsApiKey)
	require.Equal(t, utils.SanitizeString("secret"), sanitized.AnalyticsApiKey)
}

func TestClaudeEnterpriseMergeFromRequestPreservesStoredKey(t *testing.T) {
	target := &ClaudeEnterpriseConnection{
		ClaudeEnterpriseConn: ClaudeEnterpriseConn{
			AnalyticsApiKey: "stored-secret",
			OrganizationId:  "org-old",
		},
	}
	body := map[string]interface{}{
		"token":          utils.SanitizeString("stored-secret"),
		"organizationId": "org-new",
	}

	err := (&ClaudeEnterpriseConnection{}).MergeFromRequest(target, body)

	require.NoError(t, err)
	require.Equal(t, "stored-secret", target.AnalyticsApiKey)
	require.Equal(t, "org-new", target.OrganizationId)
}

func TestClaudeEnterpriseConnectionSanitizedJSONNeverIncludesSecret(t *testing.T) {
	connection := ClaudeEnterpriseConnection{
		ClaudeEnterpriseConn: ClaudeEnterpriseConn{
			AnalyticsApiKey: "super-secret-key",
			OrganizationId:  "org_123",
		},
	}

	payload, err := json.Marshal(connection.Sanitize())

	require.NoError(t, err)
	require.NotContains(t, string(payload), "super-secret-key")
	require.Contains(t, string(payload), utils.SanitizeString("super-secret-key"))
}
