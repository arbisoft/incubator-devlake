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

// Package grafanarole answers one question: is the Grafana user who clicked a
// button a Grafana org Admin?
//
// It exists because Grafana's datasource proxy is gated on datasources:query,
// not on org role, so any signed-in user -- Viewers included -- can drive the
// user-project-mapping endpoints through it. Grafana names the caller in
// X-Grafana-User; this package turns that name into a decision by asking Grafana.
package grafanarole

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/log"
)

// RoleAdmin is Grafana's org-admin role name, as returned by /api/org/users.
const RoleAdmin = "Admin"

// lookupTimeout is short on purpose: an in-cluster hop on the critical path of a
// button click, where a hung Grafana must fail closed quickly.
const lookupTimeout = 5 * time.Second

type Config struct {
	BaseURL string
	Token   string
}

// Configured reports whether both settings are present; absent, this package
// fails closed.
func (c Config) Configured() bool {
	return c.BaseURL != "" && c.Token != ""
}

type Service struct {
	cfg    Config
	client *http.Client
	logger log.Logger
}

var (
	defaultService *Service
	initOnce       sync.Once
)

func Init(basicRes context.BasicRes) {
	initOnce.Do(func() {
		cfg := basicRes.GetConfigReader()
		defaultService = &Service{
			cfg: Config{
				BaseURL: strings.TrimRight(strings.TrimSpace(cfg.GetString("GRAFANA_BASE_URL")), "/"),
				Token:   strings.TrimSpace(cfg.GetString("GRAFANA_SERVICE_ACCOUNT_TOKEN")),
			},
			client: &http.Client{Timeout: lookupTimeout},
			logger: basicRes.GetLogger(),
		}
	})
}

func Default() *Service { return defaultService }

// orgUser is the subset of Grafana's /api/org/users entry we rely on.
type orgUser struct {
	Login string `json:"login"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

// IsAdmin reports whether identity is a Grafana org Admin.
//
// identity is X-Grafana-User, which Grafana fills from user.GetLogin() -- the
// login, not the email. Google-SSO users have login == email; the migrated local
// accounts have username logins. Matching either field, case-insensitively,
// covers both.
func (s *Service) IsAdmin(identity string) (bool, error) {
	if s == nil || !s.cfg.Configured() {
		return false, fmt.Errorf("GRAFANA_BASE_URL and GRAFANA_SERVICE_ACCOUNT_TOKEN must both be set to authorize Grafana callers")
	}
	identity = strings.TrimSpace(identity)
	if identity == "" {
		return false, fmt.Errorf("no Grafana identity supplied")
	}

	endpoint := fmt.Sprintf("%s/api/org/users?query=%s&perpage=10", s.cfg.BaseURL, url.QueryEscape(identity))
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+s.cfg.Token)
	req.Header.Set("Accept", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return false, fmt.Errorf("querying Grafana org users: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Body is deliberately not echoed: on a 401 it describes our own token.
		return false, fmt.Errorf("Grafana org users lookup returned HTTP %d", resp.StatusCode)
	}

	var users []orgUser
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&users); err != nil {
		return false, fmt.Errorf("decoding Grafana org users: %w", err)
	}

	// ?query= is a substring match, so it can return near-misses. Require an exact
	// login/email hit before trusting Role.
	for _, u := range users {
		if strings.EqualFold(u.Login, identity) || strings.EqualFold(u.Email, identity) {
			return strings.EqualFold(u.Role, RoleAdmin), nil
		}
	}
	return false, nil
}
