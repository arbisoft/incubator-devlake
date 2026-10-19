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
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
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
	r := routeEngine(newServiceWithDependencies(nil, "", &fakeMappings{}, nil), adminCheckReturning(customerAdmin(), nil))
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

	down := routeEngine(newServiceWithDependencies(nil, "", &fakeMappings{}, nil), adminCheckReturning(customerAdmin(), nil))
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

type writeRoute struct {
	name    string
	method  string
	path    string
	body    string
	success int
}

func writeRoutes() []writeRoute {
	return []writeRoute{
		{"create", http.MethodPost, "/access/grafana/users", `{"email":"new@example.com","name":"New","role":"Viewer","projectNames":["alpha"],"password":"` + testPassword + `"}`, http.StatusCreated},
		{"patch", http.MethodPatch, "/access/grafana/users/2", `{"name":"Alice B"}`, http.StatusOK},
		{"projects", http.MethodPut, "/access/grafana/users/2/projects", `{"projectNames":["beta"]}`, http.StatusOK},
		{"password", http.MethodPut, "/access/grafana/users/2/password", `{"password":"` + testPassword + `"}`, http.StatusNoContent},
		{"delete", http.MethodDelete, "/access/grafana/users/2", ``, http.StatusNoContent},
		{"orphan", http.MethodDelete, "/access/grafana/orphans/ghost@example.com", ``, http.StatusNoContent},
	}
}

func doRoute(r http.Handler, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestWriteRoutesEnforceTheAdminCheck(t *testing.T) {
	cases := []struct {
		name   string
		check  adminCheck
		status int
	}{
		{"no principal", adminCheckReturning(nil, errors.Unauthorized.New("native OIDC authentication is required")), http.StatusUnauthorized},
		{"member", adminCheckReturning(nil, errors.Forbidden.New("administrator role required")), http.StatusForbidden},
		{"directory off", adminCheckReturning(nil, errors.HttpStatus(http.StatusNotFound).New("access management is not enabled")), http.StatusNotFound},
		{"zero principal", adminCheckReturning(&access.Principal{}, nil), http.StatusForbidden},
	}
	for _, route := range writeRoutes() {
		for _, tc := range cases {
			t.Run(route.name+"/"+tc.name, func(t *testing.T) {
				fx := newFixture(t)
				w := doRoute(routeEngine(fx.s, tc.check), route.method, route.path, route.body)
				if w.Code != tc.status {
					t.Fatalf("status = %d, want %d; body %s", w.Code, tc.status, w.Body)
				}
				if len(fx.f.recorded()) != 0 || len(fx.m.calls) != 0 {
					t.Fatalf("denied request reached Grafana or the mappings: %#v %v", fx.f.recorded(), fx.m.calls)
				}
			})
		}
		t.Run(route.name+"/admin", func(t *testing.T) {
			fx := newFixture(t)
			fx.m.rows = append(fx.m.rows, &models.UserProjectMapping{UserLogin: "ghost@example.com", ProjectName: "alpha"})
			w := doRoute(routeEngine(fx.s, adminCheckReturning(customerAdmin(), nil)), route.method, route.path, route.body)
			if w.Code != route.success {
				t.Fatalf("status = %d, want %d; body %s", w.Code, route.success, w.Body)
			}
			if route.success == http.StatusNoContent && w.Body.Len() != 0 {
				t.Fatalf("204 carried a body: %s", w.Body)
			}
			if strings.Contains(w.Body.String(), testPassword) {
				t.Fatal("response echoes the password")
			}
		})
	}
}

func TestWriteRoutesRejectBadIdsAndBodies(t *testing.T) {
	fx := newFixture(t)
	r := routeEngine(fx.s, adminCheckReturning(customerAdmin(), nil))
	for _, tc := range []struct{ method, path, body string }{
		{http.MethodPatch, "/access/grafana/users/abc", `{"name":"x"}`},
		{http.MethodPatch, "/access/grafana/users/0", `{"name":"x"}`},
		{http.MethodPatch, "/access/grafana/users/-4", `{"name":"x"}`},
		{http.MethodPut, "/access/grafana/users/1.5/projects", `{"projectNames":[]}`},
		{http.MethodPut, "/access/grafana/users/x/password", `{"password":"` + testPassword + `"}`},
		{http.MethodDelete, "/access/grafana/users/0", ``},
		{http.MethodPost, "/access/grafana/users", `not json`},
		{http.MethodPatch, "/access/grafana/users/2", `{}`},
		{http.MethodPut, "/access/grafana/users/2/projects", `{}`},
	} {
		if w := doRoute(r, tc.method, tc.path, tc.body); w.Code != http.StatusBadRequest {
			t.Fatalf("%s %s %s: status = %d, want 400", tc.method, tc.path, tc.body, w.Code)
		}
	}
	fx.noWrites(t)
}

func TestWriteRoutesIgnoreALoginInTheBody(t *testing.T) {
	fx := newFixture(t)
	r := routeEngine(fx.s, adminCheckReturning(customerAdmin(), nil))
	w := doRoute(r, http.MethodPost, "/access/grafana/users", `{"login":"evil","email":"New@Example.com","name":"New","role":"Viewer","projectNames":["alpha"],"password":"`+testPassword+`"}`)
	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d body %s", w.Code, w.Body)
	}
	created := fx.requestsMatching(http.MethodPost, "/api/admin/users")
	if len(created) != 1 || created[0].body["login"] != "new@example.com" || len(fx.m.loginProjects("evil")) != 0 || len(fx.m.loginProjects("new@example.com")) != 1 {
		t.Fatalf("created = %#v rows = %v", created, fx.m.rows)
	}

	w = doRoute(r, http.MethodPatch, "/access/grafana/users/2", `{"login":"evil","name":"Alice Z"}`)
	put := fx.requestsMatching(http.MethodPut, "/api/users/2")
	if w.Code != http.StatusOK || len(put) != 1 || put[0].body["login"] != "alice@example.com" || len(fx.m.loginProjects("evil")) != 0 {
		t.Fatalf("status = %d put = %#v", w.Code, put)
	}
	if strings.Contains(w.Body.String(), "login") {
		t.Fatalf("body exposes login: %s", w.Body)
	}
}

func TestCreateRouteReturnsThePartialBodyWithTheUserId(t *testing.T) {
	fx := newFixture(t)
	fx.m.replaceErr = errors.Default.New("db down")
	r := routeEngine(fx.s, adminCheckReturning(customerAdmin(), nil))
	w := doRoute(r, http.MethodPost, "/access/grafana/users", `{"email":"n@example.com","name":"N","role":"Viewer","projectNames":["alpha"],"password":"`+testPassword+`"}`)
	var body PartialErrorResponse
	if w.Code != http.StatusBadGateway || json.Unmarshal(w.Body.Bytes(), &body) != nil || body.Code != ErrCodePartial || body.UserID != 101 || body.Success || body.Message == "" {
		t.Fatalf("status = %d body %s", w.Code, w.Body)
	}
	if strings.Contains(w.Body.String(), testPassword) || strings.Contains(w.Body.String(), "db down") {
		t.Fatalf("body leaks text: %s", w.Body)
	}
}

func TestWriteRoutesReturnCodedErrors(t *testing.T) {
	fx := newFixture(t)
	r := routeEngine(fx.s, adminCheckReturning(customerAdmin(), nil))
	for _, tc := range []struct {
		method, path, body, code string
		status                   int
	}{
		{http.MethodPatch, "/access/grafana/users/999", `{"name":"x"}`, ErrCodeUserNotFound, http.StatusNotFound},
		{http.MethodPatch, "/access/grafana/users/4", `{"name":"x"}`, ErrCodeUserProtected, http.StatusForbidden},
		{http.MethodPatch, "/access/grafana/users/3", `{"name":"x"}`, ErrCodeUserSSOManaged, http.StatusConflict},
		{http.MethodPut, "/access/grafana/users/2/password", `{"password":"short"}`, ErrCodePasswordShort, http.StatusBadRequest},
		{http.MethodPut, "/access/grafana/users/2/projects", `{"projectNames":["nope"]}`, ErrCodeProjectMissing, http.StatusBadRequest},
		{http.MethodPost, "/access/grafana/users", `{"email":"alice@example.com","name":"A","role":"Viewer","password":"` + testPassword + `"}`, ErrCodeUserExists, http.StatusConflict},
		{http.MethodDelete, "/access/grafana/orphans/alice@example.com", ``, ErrCodeUserExists, http.StatusConflict},
	} {
		w := doRoute(r, tc.method, tc.path, tc.body)
		var apiErr access.ApiErrorResponse
		if w.Code != tc.status || json.Unmarshal(w.Body.Bytes(), &apiErr) != nil || apiErr.Code != tc.code || apiErr.Success {
			t.Fatalf("%s %s: status = %d body %s, want %d %s", tc.method, tc.path, w.Code, w.Body, tc.status, tc.code)
		}
	}
}

func TestOrphanRouteReceivesTheUnescapedAccount(t *testing.T) {
	fx := newFixture(t)
	fx.m.rows = append(fx.m.rows, &models.UserProjectMapping{UserLogin: "ghost user@example.com", ProjectName: "alpha"})
	r := routeEngine(fx.s, adminCheckReturning(customerAdmin(), nil))
	w := doRoute(r, http.MethodDelete, "/access/grafana/orphans/ghost%20user@example.com", "")
	if w.Code != http.StatusNoContent || len(fx.m.loginProjects("ghost user@example.com")) != 0 {
		t.Fatalf("status = %d rows = %v", w.Code, fx.m.rows)
	}
	look := fx.f.requestsTo("/api/users/lookup")
	if len(look) != 1 || look[0].query.Get("loginOrEmail") != "ghost user@example.com" {
		t.Fatalf("lookup = %#v", look)
	}
}
