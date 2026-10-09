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
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/server/api/access"
)

func adminCheckReturning(principal *access.Principal, err errors.Error) adminCheck {
	return func(c *gin.Context) (*access.Principal, errors.Error) {
		return principal, err
	}
}

func routeEngine(service *Service, check adminCheck) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	registerRoutesWithAdminCheck(r, service, check)
	return r
}

func TestRoutesEnforceTheAdminCheck(t *testing.T) {
	paths := []string{"/access/grafana/status", "/access/grafana/users"}
	cases := []struct {
		name   string
		check  adminCheck
		status int
	}{
		{"no principal", adminCheckReturning(nil, errors.Unauthorized.New("native OIDC authentication is required")), http.StatusUnauthorized},
		{"member", adminCheckReturning(nil, errors.Forbidden.New("administrator role required")), http.StatusForbidden},
		{"directory off", adminCheckReturning(nil, errors.HttpStatus(http.StatusNotFound).New("access management is not enabled")), http.StatusNotFound},
		{"admin", adminCheckReturning(customerAdmin(), nil), http.StatusOK},
	}
	for _, path := range paths {
		for _, tc := range cases {
			t.Run(path+"/"+tc.name, func(t *testing.T) {
				f := newFakeGrafana(t)
				seedDirectory(f)
				r := routeEngine(f.service(t, nil, seedMappings()), tc.check)
				w := httptest.NewRecorder()
				r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
				if w.Code != tc.status {
					t.Fatalf("status = %d, want %d; body %s", w.Code, tc.status, w.Body)
				}
				if tc.status != http.StatusOK && len(f.recorded()) != 0 {
					t.Fatalf("denied request reached Grafana: %#v", f.recorded())
				}
			})
		}
	}
}

func TestRoutesRefuseAZeroPrincipalFromTheCheck(t *testing.T) {
	f := newFakeGrafana(t)
	r := routeEngine(f.service(t, nil, &fakeMappings{}), adminCheckReturning(&access.Principal{}, nil))
	for _, path := range []string{"/access/grafana/status", "/access/grafana/users"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != http.StatusForbidden {
			t.Fatalf("%s: status = %d, want 403", path, w.Code)
		}
	}
	if len(f.recorded()) != 0 {
		t.Fatal("zero principal reached Grafana")
	}
}

func TestStatusRouteAnswers200WhenUnavailable(t *testing.T) {
	r := routeEngine(newServiceWithDependencies(nil, "", &fakeMappings{}), adminCheckReturning(customerAdmin(), nil))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/access/grafana/status", nil))
	var body StatusResponse
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &body) != nil || body.Available || body.Code != ErrCodeNotConfigured {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
}

func TestUsersRouteValidatesPagingAndReturnsCodes(t *testing.T) {
	f := newFakeGrafana(t)
	seedDirectory(f)
	r := routeEngine(f.service(t, nil, seedMappings()), adminCheckReturning(customerAdmin(), nil))
	for _, q := range []string{"?page=0", "?pageSize=0", "?pageSize=101", "?page=abc", "?pageSize=x"} {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/access/grafana/users"+q, nil))
		if w.Code != http.StatusBadRequest {
			t.Fatalf("%s: status = %d, want 400", q, w.Code)
		}
	}
	if len(f.recorded()) != 0 {
		t.Fatal("invalid paging reached Grafana")
	}

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/access/grafana/users?query=alice&page=1&pageSize=5", nil))
	var body ListResponse
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &body) != nil || body.Count != 1 || body.PageSize != 5 || len(body.Users) != 1 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
	if strings.Contains(w.Body.String(), "login") {
		t.Fatalf("body exposes login: %s", w.Body)
	}

	down := routeEngine(newServiceWithDependencies(nil, "", &fakeMappings{}), adminCheckReturning(customerAdmin(), nil))
	w = httptest.NewRecorder()
	down.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/access/grafana/users", nil))
	var apiErr access.ApiErrorResponse
	if w.Code != http.StatusServiceUnavailable || json.Unmarshal(w.Body.Bytes(), &apiErr) != nil || apiErr.Code != ErrCodeNotConfigured || apiErr.Success {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
}

func TestUsersRouteHidesGrafanaTextOnFailure(t *testing.T) {
	f := newFakeGrafana(t)
	seedDirectory(f)
	f.orgStatus = http.StatusInternalServerError
	r := routeEngine(f.service(t, nil, &fakeMappings{}), adminCheckReturning(customerAdmin(), nil))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/access/grafana/users", nil))
	var apiErr access.ApiErrorResponse
	if w.Code != http.StatusServiceUnavailable || json.Unmarshal(w.Body.Bytes(), &apiErr) != nil || apiErr.Code != ErrCodeUnavailable {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body)
	}
	if strings.Contains(w.Body.String(), fakeBodySecret) || strings.Contains(w.Body.String(), fakeManagementPassword) {
		t.Fatalf("body leaks text: %s", w.Body)
	}
}
