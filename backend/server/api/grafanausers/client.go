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
	"bytes"
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
	Created    string   `json:"created"`
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

// grafanaUser is the account detail returned by the single-user and lookup endpoints.
type grafanaUser struct {
	ID             int64    `json:"id"`
	Email          string   `json:"email"`
	Name           string   `json:"name"`
	Login          string   `json:"login"`
	IsDisabled     bool     `json:"isDisabled"`
	IsExternal     bool     `json:"isExternal"`
	IsGrafanaAdmin bool     `json:"isGrafanaAdmin"`
	AuthLabels     []string `json:"authLabels"`
}

type grafanaUserOrg struct {
	OrgID int64  `json:"orgId"`
	Role  string `json:"role"`
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

// do never returns or logs a response body; a 2xx body is decoded into out when given, and every body is drained.
func (c *grafanaClient) do(ctx context.Context, method, path string, params url.Values, payload, out interface{}) error {
	target := c.baseURL + path
	if len(params) > 0 {
		target += "?" + params.Encode()
	}
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return &requestError{}
		}
		body = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, target, body)
	if err != nil {
		return &requestError{}
	}
	req.SetBasicAuth(c.username, c.password)
	req.Header.Set("Accept", "application/json")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	response, err := c.client.Do(req)
	if err != nil {
		return &requestError{}
	}
	defer func() {
		_, _ = io.Copy(io.Discard, response.Body)
		_ = response.Body.Close()
	}()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return &requestError{status: response.StatusCode}
	}
	if out != nil {
		if err := json.NewDecoder(response.Body).Decode(out); err != nil {
			return &requestError{status: response.StatusCode}
		}
	}
	return nil
}

func (c *grafanaClient) getJSON(ctx context.Context, path string, params url.Values, out interface{}) error {
	return c.do(ctx, http.MethodGet, path, params, nil, out)
}

func userPath(id int64) string {
	return "/api/users/" + strconv.FormatInt(id, 10)
}

func adminUserPath(id int64) string {
	return "/api/admin/users/" + strconv.FormatInt(id, 10)
}

func (c *grafanaClient) createUser(ctx context.Context, name, email, login, password string) (int64, error) {
	created := &struct {
		ID int64 `json:"id"`
	}{}
	payload := map[string]string{"name": name, "email": email, "login": login, "password": password}
	if err := c.do(ctx, http.MethodPost, "/api/admin/users", nil, payload, created); err != nil {
		return 0, err
	}
	if created.ID < 1 {
		return 0, &requestError{}
	}
	return created.ID, nil
}

func (c *grafanaClient) getUser(ctx context.Context, id int64) (*grafanaUser, error) {
	user := &grafanaUser{}
	if err := c.getJSON(ctx, userPath(id), nil, user); err != nil {
		return nil, err
	}
	return user, nil
}

func (c *grafanaClient) lookupUser(ctx context.Context, loginOrEmail string) (*grafanaUser, error) {
	user := &grafanaUser{}
	if err := c.getJSON(ctx, "/api/users/lookup", url.Values{"loginOrEmail": {loginOrEmail}}, user); err != nil {
		return nil, err
	}
	return user, nil
}

func (c *grafanaClient) userOrgs(ctx context.Context, id int64) ([]grafanaUserOrg, error) {
	var orgs []grafanaUserOrg
	if err := c.getJSON(ctx, userPath(id)+"/orgs", nil, &orgs); err != nil {
		return nil, err
	}
	return orgs, nil
}

func (c *grafanaClient) addOrgUser(ctx context.Context, orgID int64, loginOrEmail, role string) error {
	payload := map[string]string{"loginOrEmail": loginOrEmail, "role": role}
	return c.do(ctx, http.MethodPost, "/api/orgs/"+strconv.FormatInt(orgID, 10)+"/users", nil, payload, nil)
}

func (c *grafanaClient) setOrgRole(ctx context.Context, orgID, id int64, role string) error {
	path := "/api/orgs/" + strconv.FormatInt(orgID, 10) + "/users/" + strconv.FormatInt(id, 10)
	return c.do(ctx, http.MethodPatch, path, nil, map[string]string{"role": role}, nil)
}

func (c *grafanaClient) updateProfile(ctx context.Context, id int64, name, email, login string) error {
	payload := map[string]string{"name": name, "email": email, "login": login}
	return c.do(ctx, http.MethodPut, userPath(id), nil, payload, nil)
}

func (c *grafanaClient) setDisabled(ctx context.Context, id int64, disabled bool) error {
	action := "enable"
	if disabled {
		action = "disable"
	}
	return c.do(ctx, http.MethodPost, adminUserPath(id)+"/"+action, nil, nil, nil)
}

func (c *grafanaClient) setPassword(ctx context.Context, id int64, password string) error {
	return c.do(ctx, http.MethodPut, adminUserPath(id)+"/password", nil, map[string]string{"password": password}, nil)
}

func (c *grafanaClient) deleteUser(ctx context.Context, id int64) error {
	return c.do(ctx, http.MethodDelete, adminUserPath(id), nil, nil, nil)
}
