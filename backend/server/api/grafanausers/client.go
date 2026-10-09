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

package grafanausers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	grafanaRequestTimeout  = 10 * time.Second
	grafanaCurrentUserPath = "/api/user"
	grafanaGlobalUsersPath = "/api/users/search"
)

// requestError carries only the HTTP status of a failed Grafana call; status 0 means no usable response.
type requestError struct {
	status int
}

func (e *requestError) Error() string {
	if e.status == 0 {
		return "Grafana request failed"
	}
	return fmt.Sprintf("Grafana request returned status %d", e.status)
}

type grafanaClient struct {
	baseURL  string
	username string
	password string
	client   *http.Client
}

func newGrafanaClient(baseURL, username, password string, client *http.Client) (*grafanaClient, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" || strings.TrimSpace(username) == "" || password == "" {
		return nil, fmt.Errorf("Grafana URL and management credentials are required")
	}
	if client == nil {
		client = &http.Client{Timeout: grafanaRequestTimeout}
	}
	return &grafanaClient{baseURL: baseURL, username: username, password: password, client: client}, nil
}

type grafanaCurrentUser struct {
	ID             int64  `json:"id"`
	Email          string `json:"email"`
	Login          string `json:"login"`
	OrgID          int64  `json:"orgId"`
	IsGrafanaAdmin bool   `json:"isGrafanaAdmin"`
}

type grafanaOrgUser struct {
	UserID     int64    `json:"userId"`
	Email      string   `json:"email"`
	Name       string   `json:"name"`
	Login      string   `json:"login"`
	Role       string   `json:"role"`
	IsDisabled bool     `json:"isDisabled"`
	LastSeenAt string   `json:"lastSeenAt"`
	AuthLabels []string `json:"authLabels"`
}

type grafanaOrgUserPage struct {
	TotalCount int              `json:"totalCount"`
	OrgUsers   []grafanaOrgUser `json:"orgUsers"`
}

type grafanaGlobalUser struct {
	ID      int64  `json:"id"`
	Login   string `json:"login"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	IsAdmin bool   `json:"isAdmin"`
}

type grafanaGlobalUserPage struct {
	TotalCount int                 `json:"totalCount"`
	Users      []grafanaGlobalUser `json:"users"`
}

func (c *grafanaClient) currentUser(ctx context.Context) (*grafanaCurrentUser, error) {
	user := &grafanaCurrentUser{}
	if err := c.getJSON(ctx, grafanaCurrentUserPath, nil, user); err != nil {
		return nil, err
	}
	return user, nil
}

func (c *grafanaClient) searchOrgUsers(ctx context.Context, orgID int64, query string, perPage, page int) (*grafanaOrgUserPage, error) {
	params := url.Values{}
	params.Set("query", query)
	params.Set("perpage", strconv.Itoa(perPage))
	params.Set("page", strconv.Itoa(page))
	result := &grafanaOrgUserPage{}
	if err := c.getJSON(ctx, "/api/orgs/"+strconv.FormatInt(orgID, 10)+"/users/search", params, result); err != nil {
		return nil, err
	}
	return result, nil
}

func (c *grafanaClient) searchGlobalUsers(ctx context.Context, perPage, page int) (*grafanaGlobalUserPage, error) {
	params := url.Values{}
	params.Set("perpage", strconv.Itoa(perPage))
	params.Set("page", strconv.Itoa(page))
	result := &grafanaGlobalUserPage{}
	if err := c.getJSON(ctx, grafanaGlobalUsersPath, params, result); err != nil {
		return nil, err
	}
	return result, nil
}

// getJSON never returns or logs a response body; the body is decoded into out and drained.
func (c *grafanaClient) getJSON(ctx context.Context, path string, params url.Values, out interface{}) error {
	target := c.baseURL + path
	if len(params) > 0 {
		target += "?" + params.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return &requestError{}
	}
	req.SetBasicAuth(c.username, c.password)
	req.Header.Set("Accept", "application/json")
	response, err := c.client.Do(req)
	if err != nil {
		return &requestError{}
	}
	defer func() {
		_, _ = io.Copy(io.Discard, response.Body)
		_ = response.Body.Close()
	}()
	if response.StatusCode != http.StatusOK {
		return &requestError{status: response.StatusCode}
	}
	if err := json.NewDecoder(response.Body).Decode(out); err != nil {
		return &requestError{status: response.StatusCode}
	}
	return nil
}
