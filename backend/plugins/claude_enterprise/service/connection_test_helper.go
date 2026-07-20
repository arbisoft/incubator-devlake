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

package service

import (
	stdctx "context"
	"fmt"
	"net/http"
	"net/url"
	"time"

	corectx "github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/errors"
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/claude_enterprise/models"
)

// TestConnectionResult represents the payload returned by the connection test endpoints.
type TestConnectionResult struct {
	Success        bool   `json:"success"`
	Message        string `json:"message"`
	OrganizationId string `json:"organizationId,omitempty"`
}

// TestConnection exercises the public Enterprise Analytics API to validate credentials.
func TestConnection(ctx stdctx.Context, br corectx.BasicRes, connection *models.ClaudeEnterpriseConnection) (*TestConnectionResult, errors.Error) {
	if connection == nil {
		return nil, errors.BadInput.New("connection is required")
	}

	connection.Normalize()

	apiClient, err := helper.NewApiClientFromConnection(ctx, br, connection)
	if err != nil {
		return nil, err
	}

	// Validate against the smallest summaries range. The response body may
	// contain organization analytics, so only status is used.
	startingDate := time.Now().UTC().AddDate(0, 0, -3).Format("2006-01-02")
	endingDate := time.Now().UTC().AddDate(0, 0, -2).Format("2006-01-02")
	query := url.Values{}
	query.Set("starting_date", startingDate)
	query.Set("ending_date", endingDate)
	res, err := apiClient.Get("organizations/analytics/summaries", query, nil)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	switch res.StatusCode {
	case http.StatusOK:
		msg := "Successfully connected to Anthropic Claude Enterprise Analytics API"
		if connection.OrganizationId != "" {
			msg = fmt.Sprintf("%s (organization: %s)", msg, connection.OrganizationId)
		}
		return &TestConnectionResult{
			Success:        true,
			Message:        msg,
			OrganizationId: connection.OrganizationId,
		}, nil
	case http.StatusUnauthorized:
		return nil, errors.HttpStatus(401).New("Unauthorized: invalid Analytics API key")
	case http.StatusForbidden:
		return nil, errors.HttpStatus(403).New("Forbidden: missing read:analytics scope or unsupported subscription")
	default:
		return nil, errors.HttpStatus(res.StatusCode).New(fmt.Sprintf("Anthropic Analytics API request failed with status %d", res.StatusCode))
	}
}
