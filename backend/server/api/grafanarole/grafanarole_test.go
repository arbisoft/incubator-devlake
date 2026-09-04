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

package grafanarole

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/server/api/shared"
	"github.com/gin-gonic/gin"
)

// stubGrafana stands in for Grafana's /api/org/users, recording the last query so
// tests can assert the identity is forwarded verbatim.
func stubGrafana(t *testing.T, status int, users []orgUser, lastQuery *string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/org/users" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-token" {
			t.Errorf("expected service-account bearer token, got %q", got)
		}
		if lastQuery != nil {
			*lastQuery = r.URL.Query().Get("query")
		}
		if status != http.StatusOK {
			w.WriteHeader(status)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(users)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func serviceFor(srv *httptest.Server) *Service {
	return &Service{
		cfg:    Config{BaseURL: srv.URL, Token: "test-token"},
		client: srv.Client(),
	}
}

func TestIsAdmin(t *testing.T) {
	cases := []struct {
		name      string
		identity  string
		status    int
		users     []orgUser
		wantAdmin bool
		wantErr   bool
	}{
		{
			name:      "admin by login",
			identity:  "alice",
			status:    http.StatusOK,
			users:     []orgUser{{Login: "alice", Email: "alice@arbisoft.com", Role: "Admin"}},
			wantAdmin: true,
		},
		{
			// Google-SSO accounts arrive as an email: Grafana sets login == email.
			name:      "admin by email",
			identity:  "alice@arbisoft.com",
			status:    http.StatusOK,
			users:     []orgUser{{Login: "alice", Email: "alice@arbisoft.com", Role: "Admin"}},
			wantAdmin: true,
		},
		{
			name:      "match is case insensitive",
			identity:  "ALICE@Arbisoft.com",
			status:    http.StatusOK,
			users:     []orgUser{{Login: "alice", Email: "alice@arbisoft.com", Role: "admin"}},
			wantAdmin: true,
		},
		{
			name:      "viewer is not admin",
			identity:  "bob",
			status:    http.StatusOK,
			users:     []orgUser{{Login: "bob", Email: "bob@arbisoft.com", Role: "Viewer"}},
			wantAdmin: false,
		},
		{
			name:      "editor is not admin",
			identity:  "bob",
			status:    http.StatusOK,
			users:     []orgUser{{Login: "bob", Email: "bob@arbisoft.com", Role: "Editor"}},
			wantAdmin: false,
		},
		{
			// ?query= is a substring search, so an unprivileged name can pull back an
			// admin row. Only an exact hit may count.
			name:      "substring near-miss does not inherit the admin role",
			identity:  "ali",
			status:    http.StatusOK,
			users:     []orgUser{{Login: "alice", Email: "alice@arbisoft.com", Role: "Admin"}},
			wantAdmin: false,
		},
		{
			name:      "unknown user",
			identity:  "nobody",
			status:    http.StatusOK,
			users:     []orgUser{},
			wantAdmin: false,
		},
		{
			name:     "empty identity errors",
			identity: "",
			status:   http.StatusOK,
			users:    []orgUser{},
			wantErr:  true,
		},
		{
			name:     "grafana rejects our token",
			identity: "alice",
			status:   http.StatusUnauthorized,
			wantErr:  true,
		},
		{
			name:     "grafana is unwell",
			identity: "alice",
			status:   http.StatusInternalServerError,
			wantErr:  true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var query string
			srv := stubGrafana(t, tc.status, tc.users, &query)
			admin, err := serviceFor(srv).IsAdmin(tc.identity)

			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected an error, got admin=%v", admin)
				}
				if admin {
					t.Fatalf("an errored lookup must never report admin")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if admin != tc.wantAdmin {
				t.Fatalf("expected admin=%v, got %v", tc.wantAdmin, admin)
			}
			if query != tc.identity {
				t.Fatalf("expected identity %q forwarded as ?query=, got %q", tc.identity, query)
			}
		})
	}
}

func TestIsAdminFailsClosedWhenUnconfigured(t *testing.T) {
	for _, tc := range []struct {
		name string
		svc  *Service
	}{
		{name: "nil service (Init never ran)", svc: nil},
		{name: "no base url", svc: &Service{cfg: Config{Token: "t"}, client: http.DefaultClient}},
		{name: "no token", svc: &Service{cfg: Config{BaseURL: "http://grafana:3000"}, client: http.DefaultClient}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			admin, err := tc.svc.IsAdmin("alice")
			if err == nil {
				t.Fatalf("expected an error when unconfigured")
			}
			if admin {
				t.Fatalf("must not report admin when unconfigured")
			}
		})
	}
}

// newRouter carries only the middleware under test. restAuth mirrors what
// RestAuthentication does before rerouting: it marks the request as API-key
// authenticated via the request context.
func newRouter(restAuth bool) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	if restAuth {
		r.Use(func(c *gin.Context) {
			c.Request = shared.SetRestAuthUser(c.Request, &common.User{Name: "api-key-creator"})
			c.Next()
		})
	}
	r.Use(RequireGrafanaAdmin())
	r.POST("/user-project-mappings/:userLogin", func(c *gin.Context) { c.String(http.StatusOK, "ok") })
	return r
}

func call(r *gin.Engine, header string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/user-project-mappings/alice", nil)
	if header != "" {
		req.Header.Set(UserHeader, header)
	}
	resp := httptest.NewRecorder()
	r.ServeHTTP(resp, req)
	return resp
}

func TestRequireGrafanaAdmin(t *testing.T) {
	admins := []orgUser{{Login: "alice", Email: "alice@arbisoft.com", Role: "Admin"}}
	viewers := []orgUser{{Login: "bob", Email: "bob@arbisoft.com", Role: "Viewer"}}

	t.Run("admin passes", func(t *testing.T) {
		srv := stubGrafana(t, http.StatusOK, admins, nil)
		withService(t, serviceFor(srv))
		if code := call(newRouter(true), "alice").Code; code != http.StatusOK {
			t.Fatalf("expected 200 for a Grafana Admin, got %d", code)
		}
	})

	t.Run("viewer is denied", func(t *testing.T) {
		srv := stubGrafana(t, http.StatusOK, viewers, nil)
		withService(t, serviceFor(srv))
		if code := call(newRouter(true), "bob").Code; code != http.StatusForbidden {
			t.Fatalf("expected 403 for a Grafana Viewer, got %d", code)
		}
	})

	t.Run("missing X-Grafana-User is denied", func(t *testing.T) {
		srv := stubGrafana(t, http.StatusOK, admins, nil)
		withService(t, serviceFor(srv))
		if code := call(newRouter(true), "").Code; code != http.StatusForbidden {
			t.Fatalf("expected 403 without the identity header, got %d", code)
		}
	})

	t.Run("unconfigured service is denied", func(t *testing.T) {
		withService(t, nil)
		if code := call(newRouter(true), "alice").Code; code != http.StatusForbidden {
			t.Fatalf("expected 403 when the lookup is unconfigured, got %d", code)
		}
	})

	// Session callers keep working as before; this closes only the proxy path.
	t.Run("non api-key caller passes through untouched", func(t *testing.T) {
		withService(t, nil)
		if code := call(newRouter(false), "").Code; code != http.StatusOK {
			t.Fatalf("expected a session caller to be unaffected, got %d", code)
		}
	})
}

// withService swaps the package singleton for one test; Init guards with
// sync.Once, so tests set defaultService directly.
func withService(t *testing.T, s *Service) {
	t.Helper()
	prev := defaultService
	defaultService = s
	t.Cleanup(func() { defaultService = prev })
}
