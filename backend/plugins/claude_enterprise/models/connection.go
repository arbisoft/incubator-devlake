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
	"net/http"
	"strings"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/utils"
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
)

const (
	// DefaultEndpoint is the Anthropic API base URL.
	DefaultEndpoint = "https://api.anthropic.com/v1"
	// DefaultRateLimitPerHour is conservative against the documented
	// organization-wide Analytics API default of 60 requests/minute.
	DefaultRateLimitPerHour = 2400
	// AnthropicVersion is the required anthropic-version header value.
	AnthropicVersion = "2023-06-01"
)

// ClaudeEnterpriseConn stores Anthropic Claude Enterprise connection settings.
type ClaudeEnterpriseConn struct {
	helper.RestConnection `mapstructure:",squash"`
	AnalyticsApiKey       string `mapstructure:"token" json:"token" gorm:"column:analytics_api_key;serializer:encdec"`
	OrganizationId        string `mapstructure:"organizationId" json:"organizationId" gorm:"type:varchar(255)"`
	RateLimitPerHour      int    `mapstructure:"rateLimitPerHour" json:"rateLimitPerHour"`
}

// SetupAuthentication implements plugin.ApiAuthenticator so helper.NewApiClientFromConnection
// can attach the x-api-key header for Anthropic API requests.
func (conn *ClaudeEnterpriseConn) SetupAuthentication(request *http.Request) errors.Error {
	if conn == nil {
		return errors.BadInput.New("connection is required")
	}
	key := strings.TrimSpace(conn.AnalyticsApiKey)
	if key == "" {
		return errors.BadInput.New("analyticsApiKey is required")
	}
	request.Header.Set("x-api-key", key)
	request.Header.Set("anthropic-version", AnthropicVersion)
	return nil
}

// Sanitize returns a copy with secrets redacted.
func (conn ClaudeEnterpriseConn) Sanitize() ClaudeEnterpriseConn {
	conn.AnalyticsApiKey = utils.SanitizeString(conn.AnalyticsApiKey)
	return conn
}

// ClaudeEnterpriseConnection persists Claude Enterprise connection details with metadata required by DevLake.
type ClaudeEnterpriseConnection struct {
	helper.BaseConnection `mapstructure:",squash"`
	ClaudeEnterpriseConn  `mapstructure:",squash"`
}

func (ClaudeEnterpriseConnection) TableName() string {
	return "_tool_claude_enterprise_connections"
}

// Sanitize returns a safe copy of the connection for API responses.
func (connection ClaudeEnterpriseConnection) Sanitize() ClaudeEnterpriseConnection {
	connection.ClaudeEnterpriseConn = connection.ClaudeEnterpriseConn.Sanitize()
	return connection
}

// MergeFromRequest merges user-supplied fields onto the existing connection,
// preserving the stored API key if the caller sends back the sanitized placeholder.
func (connection *ClaudeEnterpriseConnection) MergeFromRequest(target *ClaudeEnterpriseConnection, body map[string]interface{}) error {
	if target == nil {
		return nil
	}
	originalKey := target.AnalyticsApiKey
	if err := helper.DecodeMapStruct(body, target, true); err != nil {
		return err
	}
	sanitized := utils.SanitizeString(originalKey)
	if target.AnalyticsApiKey == "" || target.AnalyticsApiKey == sanitized {
		target.AnalyticsApiKey = originalKey
	}
	return nil
}

// Normalize applies default connection values where necessary.
func (connection *ClaudeEnterpriseConnection) Normalize() {
	if connection == nil {
		return
	}
	connection.Endpoint = strings.TrimRight(strings.TrimSpace(connection.Endpoint), "/")
	if connection.Endpoint == "" {
		connection.Endpoint = DefaultEndpoint
	}
	connection.OrganizationId = strings.TrimSpace(connection.OrganizationId)
	if connection.RateLimitPerHour <= 0 {
		connection.RateLimitPerHour = DefaultRateLimitPerHour
	}
}
