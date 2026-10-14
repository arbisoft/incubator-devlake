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
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/server/api/access"
)

const (
	fakeManagementUser     = "svc-manager"
	fakeManagementPassword = "fake-management-password"
	fakeBodySecret         = "SECRET-GRAFANA-BODY-TEXT"
)

type recordedRequest struct {
	method string
	path   string
	query  url.Values
	user   string
	body   map[string]interface{}
}

// fakeUser is one Grafana account; role is its org role, empty when it is not a member.
type fakeUser struct {
	grafanaUser
	role string
}

type fakeGrafana struct {
	t      *testing.T
	server *httptest.Server

	mu       sync.Mutex
	requests []recordedRequest

	current       grafanaCurrentUser
	currentStatus int
	orgUsers      []grafanaOrgUser
	globalUsers   []grafanaGlobalUser
	orgStatus     int
	globalStatus  int
	delay         time.Duration

	users  map[int64]*fakeUser
	nextID int64
	// forced answers a "METHOD /path" with an error status.
	forced map[string]int
	// noAutoJoin makes created accounts start outside the org.
	noAutoJoin bool
}

func newFakeGrafana(t *testing.T) *fakeGrafana {
	f := &fakeGrafana{
		t:             t,
		current:       grafanaCurrentUser{ID: 1, Login: fakeManagementUser, Email: "svc@example.com", OrgID: 7, IsGrafanaAdmin: true},
		currentStatus: http.StatusOK,
		orgStatus:     http.StatusOK,
		globalStatus:  http.StatusOK,
		users:         map[int64]*fakeUser{},
		nextID:        100,
		forced:        map[string]int{},
	}
	f.server = httptest.NewServer(http.HandlerFunc(f.handle))
	t.Cleanup(f.server.Close)
	return f
}

func (f *fakeGrafana) handle(w http.ResponseWriter, r *http.Request) {
	user, _, _ := r.BasicAuth()
	var body map[string]interface{}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}
	f.mu.Lock()
	f.requests = append(f.requests, recordedRequest{method: r.Method, path: r.URL.Path, query: r.URL.Query(), user: user, body: body})
	f.mu.Unlock()
	if f.delay > 0 {
		time.Sleep(f.delay)
	}
	if status := f.forced[r.Method+" "+r.URL.Path]; status != 0 {
		f.reply(w, status, nil)
		return
	}
	if f.handleWrite(w, r, body) {
		return
	}
	switch {
	case r.URL.Path == "/api/user":
		f.reply(w, f.currentStatus, f.current)
	case r.URL.Path == "/api/orgs/7/users/search":
		query := strings.ToLower(r.URL.Query().Get("query"))
		matched := []grafanaOrgUser{}
		for _, u := range f.orgUsers {
			if strings.Contains(strings.ToLower(u.Login+" "+u.Email+" "+u.Name), query) {
				matched = append(matched, u)
			}
		}
		start, end := pageBounds(r.URL.Query(), len(matched))
		f.reply(w, f.orgStatus, map[string]interface{}{"totalCount": len(matched), "orgUsers": matched[start:end]})
	case r.URL.Path == "/api/users/search":
		start, end := pageBounds(r.URL.Query(), len(f.globalUsers))
		f.reply(w, f.globalStatus, map[string]interface{}{"totalCount": len(f.globalUsers), "users": f.globalUsers[start:end]})
	default:
		http.NotFound(w, r)
	}
}

func pageBounds(q url.Values, total int) (int, int) {
	perPage, _ := strconv.Atoi(q.Get("perpage"))
	page, _ := strconv.Atoi(q.Get("page"))
	if perPage < 1 || page < 1 {
		return 0, total
	}
	start := (page - 1) * perPage
	if start > total {
		start = total
	}
	end := start + perPage
	if end > total {
		end = total
	}
	return start, end
}

func (f *fakeGrafana) reply(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if status != http.StatusOK {
		w.WriteHeader(status)
		_, _ = w.Write([]byte(`{"message":"` + fakeBodySecret + `"}`))
		return
	}
	_ = json.NewEncoder(w).Encode(body)
}

func (f *fakeGrafana) put(u fakeUser) *fakeUser {
	stored := u
	f.users[u.ID] = &stored
	if u.role != "" {
		f.setOrgUser(&stored)
	}
	return &stored
}

func (f *fakeGrafana) setOrgUser(u *fakeUser) {
	for i := range f.orgUsers {
		if f.orgUsers[i].UserID == u.ID {
			f.orgUsers[i].Role, f.orgUsers[i].IsDisabled = u.role, u.IsDisabled
			f.orgUsers[i].Login, f.orgUsers[i].Email, f.orgUsers[i].Name = u.Login, u.Email, u.Name
			return
		}
	}
	f.orgUsers = append(f.orgUsers, grafanaOrgUser{UserID: u.ID, Login: u.Login, Email: u.Email, Name: u.Name, Role: u.role, IsDisabled: u.IsDisabled})
}

func str(body map[string]interface{}, key string) string {
	value, _ := body[key].(string)
	return value
}

// handleWrite serves the account endpoints from f.users and reports whether it matched the request.
func (f *fakeGrafana) handleWrite(w http.ResponseWriter, r *http.Request, body map[string]interface{}) bool {
	path := r.URL.Path
	ok := func() { f.reply(w, http.StatusOK, map[string]string{"message": "ok"}) }
	switch {
	case r.Method == http.MethodPost && path == "/api/admin/users":
		for _, u := range f.users {
			if strings.EqualFold(u.Login, str(body, "login")) || strings.EqualFold(u.Email, str(body, "email")) {
				f.reply(w, http.StatusPreconditionFailed, nil)
				return true
			}
		}
		f.nextID++
		created := fakeUser{grafanaUser: grafanaUser{ID: f.nextID, Login: str(body, "login"), Email: str(body, "email"), Name: str(body, "name")}}
		if !f.noAutoJoin {
			created.role = roleViewer
		}
		f.put(created)
		f.reply(w, http.StatusOK, map[string]int64{"id": f.nextID})
		return true
	case r.Method == http.MethodGet && path == "/api/users/lookup":
		needle := strings.ToLower(r.URL.Query().Get("loginOrEmail"))
		for _, u := range f.users {
			if strings.ToLower(u.Login) == needle || strings.ToLower(u.Email) == needle {
				f.reply(w, http.StatusOK, u.grafanaUser)
				return true
			}
		}
		http.NotFound(w, r)
		return true
	case r.Method == http.MethodPost && path == "/api/orgs/7/users":
		for _, u := range f.users {
			if u.Login == str(body, "loginOrEmail") || u.Email == str(body, "loginOrEmail") {
				u.role = str(body, "role")
				f.setOrgUser(u)
				ok()
				return true
			}
		}
		http.NotFound(w, r)
		return true
	}
	var id int64
	var rest string
	for _, prefix := range []string{"/api/admin/users/", "/api/users/", "/api/orgs/7/users/"} {
		if strings.HasPrefix(path, prefix) {
			parts := strings.SplitN(strings.TrimPrefix(path, prefix), "/", 2)
			id, _ = strconv.ParseInt(parts[0], 10, 64)
			if len(parts) == 2 {
				rest = parts[1]
			}
			if id == 0 {
				return false
			}
			target, found := f.users[id]
			if !found {
				http.NotFound(w, r)
				return true
			}
			return f.handleAccount(w, r, body, prefix, rest, target)
		}
	}
	return false
}

func (f *fakeGrafana) handleAccount(w http.ResponseWriter, r *http.Request, body map[string]interface{}, prefix, rest string, u *fakeUser) bool {
	ok := func() { f.reply(w, http.StatusOK, map[string]string{"message": "ok"}) }
	switch {
	case prefix == "/api/users/" && r.Method == http.MethodGet && rest == "":
		f.reply(w, http.StatusOK, u.grafanaUser)
	case prefix == "/api/users/" && r.Method == http.MethodGet && rest == "orgs":
		orgs := []grafanaUserOrg{}
		if u.role != "" {
			orgs = append(orgs, grafanaUserOrg{OrgID: 7, Role: u.role})
		}
		f.reply(w, http.StatusOK, orgs)
	case prefix == "/api/users/" && r.Method == http.MethodPut && rest == "":
		if u.IsExternal {
			f.reply(w, http.StatusForbidden, nil)
			return true
		}
		for _, other := range f.users {
			if other.ID != u.ID && (strings.EqualFold(other.Login, str(body, "login")) || strings.EqualFold(other.Email, str(body, "email"))) {
				f.reply(w, http.StatusPreconditionFailed, nil)
				return true
			}
		}
		u.Name, u.Email, u.Login = str(body, "name"), str(body, "email"), str(body, "login")
		f.setOrgUser(u)
		ok()
	case prefix == "/api/orgs/7/users/" && r.Method == http.MethodPatch:
		u.role = str(body, "role")
		f.setOrgUser(u)
		ok()
	case prefix == "/api/admin/users/" && r.Method == http.MethodPost && (rest == "disable" || rest == "enable"):
		u.IsDisabled = rest == "disable"
		f.setOrgUser(u)
		ok()
	case prefix == "/api/admin/users/" && r.Method == http.MethodPut && rest == "password":
		ok()
	case prefix == "/api/admin/users/" && r.Method == http.MethodDelete && rest == "":
		delete(f.users, u.ID)
		ok()
	default:
		return false
	}
	return true
}

func (f *fakeGrafana) recorded() []recordedRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]recordedRequest(nil), f.requests...)
}

func (f *fakeGrafana) requestsTo(path string) []recordedRequest {
	var out []recordedRequest
	for _, r := range f.recorded() {
		if r.path == path {
			out = append(out, r)
		}
	}
	return out
}

type fakeMappings struct {
	rows     []*models.UserProjectMapping
	projects map[string]bool

	replaceErr errors.Error
	calls      []string
}

func (m *fakeMappings) mappingsForLogins(logins []string) ([]*models.UserProjectMapping, errors.Error) {
	wanted := map[string]bool{}
	for _, l := range logins {
		wanted[l] = true
	}
	out := []*models.UserProjectMapping{}
	for _, row := range m.rows {
		if wanted[row.UserLogin] {
			out = append(out, row)
		}
	}
	return out, nil
}

func (m *fakeMappings) mappingLogins() ([]string, errors.Error) {
	seen := map[string]bool{}
	out := []string{}
	for _, row := range m.rows {
		if !seen[row.UserLogin] {
			seen[row.UserLogin] = true
			out = append(out, row.UserLogin)
		}
	}
	return out, nil
}

func (m *fakeMappings) projectExists(name string) (bool, errors.Error) {
	return m.projects[name], nil
}

func (m *fakeMappings) loginProjects(login string) []string {
	var out []string
	for _, row := range m.rows {
		if row.UserLogin == login {
			out = append(out, row.ProjectName)
		}
	}
	sort.Strings(out)
	return out
}

func (m *fakeMappings) replaceMappings(login string, names []string) errors.Error {
	m.calls = append(m.calls, "replace:"+login)
	if m.replaceErr != nil {
		return m.replaceErr
	}
	kept := []*models.UserProjectMapping{}
	for _, row := range m.rows {
		if row.UserLogin != login {
			kept = append(kept, row)
		}
	}
	for _, name := range names {
		kept = append(kept, &models.UserProjectMapping{UserLogin: login, ProjectName: name})
	}
	m.rows = kept
	return nil
}

// transact applies change and then during; a failure restores the rows as a rolled-back transaction would.
func (m *fakeMappings) transact(change func(), during func() errors.Error) errors.Error {
	snapshot := append([]*models.UserProjectMapping(nil), m.rows...)
	change()
	if during != nil {
		if err := during(); err != nil {
			m.rows = snapshot
			return err
		}
	}
	return nil
}

func (m *fakeMappings) moveMappings(oldLogin, newLogin string, during func() errors.Error) (int64, errors.Error) {
	m.calls = append(m.calls, "move:"+oldLogin+"->"+newLogin)
	dropped := int64(len(m.loginProjects(newLogin)))
	err := m.transact(func() {
		kept := []*models.UserProjectMapping{}
		for _, row := range m.rows {
			switch row.UserLogin {
			case newLogin:
			case oldLogin:
				kept = append(kept, &models.UserProjectMapping{UserLogin: newLogin, ProjectName: row.ProjectName})
			default:
				kept = append(kept, row)
			}
		}
		m.rows = kept
	}, during)
	if err != nil {
		return 0, err
	}
	return dropped, nil
}

func (m *fakeMappings) deleteMappings(login string, during func() errors.Error) errors.Error {
	m.calls = append(m.calls, "delete:"+login)
	return m.transact(func() {
		kept := []*models.UserProjectMapping{}
		for _, row := range m.rows {
			if row.UserLogin != login {
				kept = append(kept, row)
			}
		}
		m.rows = kept
	}, during)
}

type fakeAudit struct {
	events []auditEvent
}

type auditEvent struct {
	actor, action, target, detail string
}

func (a *fakeAudit) RecordAuditEvent(actor, action, targetEmail, detail string) {
	a.events = append(a.events, auditEvent{actor, action, targetEmail, detail})
}

func (a *fakeAudit) last(t *testing.T) auditEvent {
	t.Helper()
	if len(a.events) == 0 {
		t.Fatal("no audit event recorded")
	}
	return a.events[len(a.events)-1]
}

func (f *fakeGrafana) service(t *testing.T, httpClient *http.Client, mappings mappingStore) *Service {
	return f.serviceWithAudit(t, httpClient, mappings, nil)
}

func (f *fakeGrafana) serviceWithAudit(t *testing.T, httpClient *http.Client, mappings mappingStore, audit auditRecorder) *Service {
	client, err := newGrafanaClient(f.server.URL, fakeManagementUser, fakeManagementPassword, httpClient)
	if err != nil {
		t.Fatal(err)
	}
	return newServiceWithDependencies(client, fakeManagementUser, mappings, audit)
}

func customerAdmin() *access.Principal {
	return &access.Principal{UserID: 1, Role: access.RoleCustomerAdmin}
}

func errorCode(err errors.Error) string {
	code, _ := err.GetData().(string)
	return code
}

func seedDirectory(f *fakeGrafana) {
	f.orgUsers = []grafanaOrgUser{
		{UserID: 1, Login: fakeManagementUser, Email: "svc@example.com", Name: "Service", Role: "Viewer"},
		{UserID: 2, Login: "alice@example.com", Email: "alice@example.com", Name: "Alice", Role: "Editor", LastSeenAt: "2026-10-01T10:00:00Z", AuthLabels: []string{"Google"}},
		{UserID: 3, Login: "bob@example.com", Email: "bob@example.com", Name: "Bob", Role: "None", IsDisabled: true},
		{UserID: 4, Login: "admin", Email: "admin@localhost", Name: "Admin", Role: "Admin"},
	}
	f.globalUsers = []grafanaGlobalUser{
		{ID: 1, Login: fakeManagementUser, Email: "svc@example.com", Name: "Service", IsAdmin: true},
		{ID: 2, Login: "alice@example.com", Email: "alice@example.com", Name: "Alice"},
		{ID: 3, Login: "bob@example.com", Email: "bob@example.com", Name: "Bob"},
		{ID: 4, Login: "admin", Email: "admin@localhost", Name: "Admin", IsAdmin: true},
		{ID: 5, Login: "outsider@example.com", Email: "outsider@example.com", Name: "Outsider"},
	}
}

func seedMappings() *fakeMappings {
	return &fakeMappings{rows: []*models.UserProjectMapping{
		{UserLogin: "Alice@example.com", ProjectName: "casing-orphan"},
		{UserLogin: "alice@example.com", ProjectName: "zeta"},
		{UserLogin: "alice@example.com", ProjectName: "alpha"},
		{UserLogin: "ghost@example.com", ProjectName: "beta"},
		{UserLogin: "ghost@example.com", ProjectName: "alpha"},
	}}
}

func TestStatusOutcomes(t *testing.T) {
	t.Run("available", func(t *testing.T) {
		f := newFakeGrafana(t)
		status, err := f.service(t, nil, &fakeMappings{}).Status(t.Context(), customerAdmin())
		if err != nil || !status.Available || status.Code != "" {
			t.Fatalf("status = %#v, err = %v", status, err)
		}
		reqs := f.recorded()
		if len(reqs) != 1 || reqs[0].method != http.MethodGet || reqs[0].path != "/api/user" || reqs[0].user != fakeManagementUser {
			t.Fatalf("requests = %#v", reqs)
		}
	})
	t.Run("not configured", func(t *testing.T) {
		service := newServiceWithDependencies(nil, "", &fakeMappings{}, nil)
		status, err := service.Status(t.Context(), customerAdmin())
		if err != nil || status.Available || status.Code != ErrCodeNotConfigured {
			t.Fatalf("status = %#v, err = %v", status, err)
		}
	})
	t.Run("unavailable", func(t *testing.T) {
		f := newFakeGrafana(t)
		f.currentStatus = http.StatusUnauthorized
		status, err := f.service(t, nil, &fakeMappings{}).Status(t.Context(), customerAdmin())
		if err != nil || status.Available || status.Code != ErrCodeUnavailable {
			t.Fatalf("status = %#v, err = %v", status, err)
		}
	})
	t.Run("not server admin", func(t *testing.T) {
		f := newFakeGrafana(t)
		f.current.IsGrafanaAdmin = false
		status, err := f.service(t, nil, &fakeMappings{}).Status(t.Context(), customerAdmin())
		if err != nil || status.Available || status.Code != ErrCodeNotServerAdmin {
			t.Fatalf("status = %#v, err = %v", status, err)
		}
	})
}

func TestListUsersHappyPath(t *testing.T) {
	f := newFakeGrafana(t)
	seedDirectory(f)
	service := f.service(t, nil, seedMappings())

	result, err := service.ListUsers(t.Context(), customerAdmin(), ListQuery{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatal(err)
	}
	if result.Count != 3 || result.Page != 1 || result.PageSize != 20 || len(result.Users) != 3 {
		t.Fatalf("result = %#v", result)
	}
	byEmail := map[string]GrafanaUser{}
	for _, u := range result.Users {
		byEmail[u.Email] = u
	}
	if _, ok := byEmail["svc@example.com"]; ok {
		t.Fatal("management identity was listed")
	}
	alice := byEmail["alice@example.com"]
	if alice.ID != 2 || alice.Role != "Editor" || !alice.SSO || alice.Protected || alice.LastSeenAt != "2026-10-01T10:00:00Z" {
		t.Fatalf("alice = %#v", alice)
	}
	if strings.Join(alice.Projects, ",") != "alpha,zeta" {
		t.Fatalf("alice projects = %v, want exact-login match sorted", alice.Projects)
	}
	bob := byEmail["bob@example.com"]
	if bob.Role != "None" || !bob.Disabled || bob.SSO || bob.Protected || bob.Projects == nil || len(bob.Projects) != 0 || bob.LastSeenAt != "" {
		t.Fatalf("bob = %#v", bob)
	}
	if !byEmail["admin@localhost"].Protected {
		t.Fatal("server admin was not protected")
	}
	if len(result.Orphans) != 2 || result.Orphans[0].Account != "Alice@example.com" || result.Orphans[1].Account != "ghost@example.com" ||
		strings.Join(result.Orphans[1].Projects, ",") != "alpha,beta" {
		t.Fatalf("orphans = %#v", result.Orphans)
	}

	orgSearch := f.requestsTo("/api/orgs/7/users/search")
	if len(orgSearch) != 1 || orgSearch[0].query.Get("perpage") != "20" || orgSearch[0].query.Get("page") != "1" || orgSearch[0].query.Get("query") != "" {
		t.Fatalf("org search = %#v", orgSearch)
	}
	global := f.requestsTo("/api/users/search")
	if len(global) != 1 || global[0].query.Get("perpage") != "1000" || global[0].query.Get("query") != "" {
		t.Fatalf("global search = %#v", global)
	}
	for _, r := range f.recorded() {
		if r.method != http.MethodGet || r.user != fakeManagementUser {
			t.Fatalf("unexpected request %#v", r)
		}
	}

	body, _ := json.Marshal(result)
	if strings.Contains(string(body), `"login"`) || strings.Contains(string(body), `"projects":null`) || strings.Contains(string(body), `"orphans":null`) {
		t.Fatalf("response leaks login or null lists: %s", body)
	}
}

func TestListUsersEmptyResultHasNonNullLists(t *testing.T) {
	f := newFakeGrafana(t)
	service := f.service(t, nil, &fakeMappings{})
	result, err := service.ListUsers(t.Context(), customerAdmin(), ListQuery{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(result)
	if !strings.Contains(string(body), `"users":[]`) || !strings.Contains(string(body), `"orphans":[]`) {
		t.Fatalf("body = %s", body)
	}
}

func TestListUsersForwardsQueryAndPaging(t *testing.T) {
	f := newFakeGrafana(t)
	seedDirectory(f)
	service := f.service(t, nil, seedMappings())

	result, err := service.ListUsers(t.Context(), customerAdmin(), ListQuery{Query: "Bob", Page: 1, PageSize: 5})
	if err != nil {
		t.Fatal(err)
	}
	if result.Count != 1 || len(result.Users) != 1 || result.Users[0].Email != "bob@example.com" {
		t.Fatalf("result = %#v", result)
	}
	orgSearch := f.requestsTo("/api/orgs/7/users/search")
	if orgSearch[0].query.Get("query") != "Bob" || orgSearch[0].query.Get("perpage") != "5" {
		t.Fatalf("org search = %#v", orgSearch)
	}
}

func TestListUsersAdjustsCountForManagementIdentity(t *testing.T) {
	t.Run("on the page", func(t *testing.T) {
		f := newFakeGrafana(t)
		seedDirectory(f)
		result, err := f.service(t, nil, &fakeMappings{}).ListUsers(t.Context(), customerAdmin(), ListQuery{Query: "SERVICE", Page: 1, PageSize: 20})
		if err != nil {
			t.Fatal(err)
		}
		if result.Count != 0 || len(result.Users) != 0 {
			t.Fatalf("result = %#v", result)
		}
	})
	t.Run("on another page", func(t *testing.T) {
		f := newFakeGrafana(t)
		seedDirectory(f)
		result, err := f.service(t, nil, &fakeMappings{}).ListUsers(t.Context(), customerAdmin(), ListQuery{Page: 2, PageSize: 2})
		if err != nil {
			t.Fatal(err)
		}
		if result.Count != 3 || len(result.Users) != 2 {
			t.Fatalf("result = %#v", result)
		}
	})
	t.Run("not matching the query", func(t *testing.T) {
		f := newFakeGrafana(t)
		seedDirectory(f)
		result, err := f.service(t, nil, &fakeMappings{}).ListUsers(t.Context(), customerAdmin(), ListQuery{Query: "example.com", Page: 2, PageSize: 1})
		if err != nil {
			t.Fatal(err)
		}
		if result.Count != 2 || len(result.Users) != 1 {
			t.Fatalf("result = %#v", result)
		}
	})
}

func TestListUsersCachesOrgIDAfterSuccess(t *testing.T) {
	f := newFakeGrafana(t)
	seedDirectory(f)
	service := f.service(t, nil, &fakeMappings{})
	for i := 0; i < 2; i++ {
		if _, err := service.ListUsers(t.Context(), customerAdmin(), ListQuery{Page: 1, PageSize: 20}); err != nil {
			t.Fatal(err)
		}
	}
	if n := len(f.requestsTo("/api/user")); n != 1 {
		t.Fatalf("/api/user requests = %d, want 1", n)
	}

	failing := newFakeGrafana(t)
	failing.currentStatus = http.StatusInternalServerError
	failingService := failing.service(t, nil, &fakeMappings{})
	for i := 0; i < 2; i++ {
		if _, err := failingService.ListUsers(t.Context(), customerAdmin(), ListQuery{Page: 1, PageSize: 20}); err == nil {
			t.Fatal("want error")
		}
	}
	if n := len(failing.requestsTo("/api/user")); n != 2 {
		t.Fatalf("failed reads were cached: %d requests", n)
	}
}

func TestListUsersReadsEveryGlobalPage(t *testing.T) {
	f := newFakeGrafana(t)
	seedDirectory(f)
	for i := 0; i < 1500; i++ {
		f.globalUsers = append(f.globalUsers, grafanaGlobalUser{ID: int64(100 + i), Login: "bulk" + strconv.Itoa(i)})
	}
	f.globalUsers = append(f.globalUsers, grafanaGlobalUser{ID: 9999, Login: "ghost-now-exists@example.com"})
	mappings := &fakeMappings{rows: []*models.UserProjectMapping{{UserLogin: "ghost-now-exists@example.com", ProjectName: "p"}}}
	result, err := f.service(t, nil, mappings).ListUsers(t.Context(), customerAdmin(), ListQuery{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatal(err)
	}
	if n := len(f.requestsTo("/api/users/search")); n != 2 {
		t.Fatalf("global search requests = %d, want 2", n)
	}
	if len(result.Orphans) != 0 {
		t.Fatalf("orphans = %#v, want none", result.Orphans)
	}
}

func TestListUsersValidatesPaging(t *testing.T) {
	f := newFakeGrafana(t)
	service := f.service(t, nil, &fakeMappings{})
	for _, q := range []ListQuery{{Page: 0, PageSize: 20}, {Page: 1, PageSize: 0}, {Page: 1, PageSize: 101}, {Page: -1, PageSize: 20}} {
		_, err := service.ListUsers(t.Context(), customerAdmin(), q)
		if err == nil || err.GetType() != errors.BadInput {
			t.Fatalf("query %#v: err = %v, want BadInput", q, err)
		}
	}
	if len(f.recorded()) != 0 {
		t.Fatal("invalid query reached Grafana")
	}
}

func TestListUsersMapsGrafanaFailuresToUnavailableWithoutBodyText(t *testing.T) {
	cases := map[string]func(f *fakeGrafana){
		"current user 401":  func(f *fakeGrafana) { f.currentStatus = http.StatusUnauthorized },
		"current user 403":  func(f *fakeGrafana) { f.currentStatus = http.StatusForbidden },
		"org search 401":    func(f *fakeGrafana) { f.orgStatus = http.StatusUnauthorized },
		"org search 500":    func(f *fakeGrafana) { f.orgStatus = http.StatusInternalServerError },
		"global search 500": func(f *fakeGrafana) { f.globalStatus = http.StatusInternalServerError },
		"global search 403": func(f *fakeGrafana) { f.globalStatus = http.StatusForbidden },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			f := newFakeGrafana(t)
			seedDirectory(f)
			mutate(f)
			_, err := f.service(t, nil, &fakeMappings{}).ListUsers(t.Context(), customerAdmin(), ListQuery{Page: 1, PageSize: 20})
			assertUnavailable(t, err)
		})
	}

	t.Run("timeout", func(t *testing.T) {
		f := newFakeGrafana(t)
		seedDirectory(f)
		f.delay = 300 * time.Millisecond
		_, err := f.service(t, &http.Client{Timeout: 50 * time.Millisecond}, &fakeMappings{}).ListUsers(t.Context(), customerAdmin(), ListQuery{Page: 1, PageSize: 20})
		assertUnavailable(t, err)
	})
	t.Run("network error", func(t *testing.T) {
		f := newFakeGrafana(t)
		service := f.service(t, nil, &fakeMappings{})
		f.server.Close()
		_, err := service.ListUsers(t.Context(), customerAdmin(), ListQuery{Page: 1, PageSize: 20})
		assertUnavailable(t, err)
	})
}

func assertUnavailable(t *testing.T, err errors.Error) {
	t.Helper()
	if err == nil {
		t.Fatal("want error")
	}
	if errorCode(err) != ErrCodeUnavailable || err.GetType().GetHttpCode() != http.StatusServiceUnavailable {
		t.Fatalf("err = %v (code %q, http %d)", err, errorCode(err), err.GetType().GetHttpCode())
	}
	for _, text := range []string{err.Error(), err.Messages().Get()} {
		if strings.Contains(text, fakeBodySecret) || strings.Contains(text, fakeManagementPassword) {
			t.Fatalf("error leaks upstream or credential text: %q", text)
		}
	}
}

func TestListUsersUnconfiguredMakesNoRequests(t *testing.T) {
	f := newFakeGrafana(t)
	service := newServiceWithDependencies(nil, "", &fakeMappings{}, nil)
	_, err := service.ListUsers(t.Context(), customerAdmin(), ListQuery{Page: 1, PageSize: 20})
	if err == nil || errorCode(err) != ErrCodeNotConfigured || err.GetType().GetHttpCode() != http.StatusServiceUnavailable {
		t.Fatalf("err = %v", err)
	}
	if len(f.recorded()) != 0 {
		t.Fatal("unconfigured service made requests")
	}
}

func TestNotServerAdminListIsServiceUnavailable(t *testing.T) {
	f := newFakeGrafana(t)
	f.current.IsGrafanaAdmin = false
	_, err := f.service(t, nil, &fakeMappings{}).ListUsers(t.Context(), customerAdmin(), ListQuery{Page: 1, PageSize: 20})
	if err == nil || errorCode(err) != ErrCodeNotServerAdmin || err.GetType().GetHttpCode() != http.StatusServiceUnavailable {
		t.Fatalf("err = %v", err)
	}
}

func TestExportedMethodsRefuseNonAdminsWithoutCallingGrafana(t *testing.T) {
	principals := map[string]*access.Principal{
		"nil":    nil,
		"member": {UserID: 2, Role: access.RoleMember},
		"zero":   {},
	}
	methods := map[string]func(s *Service, p *access.Principal) errors.Error{
		"Status": func(s *Service, p *access.Principal) errors.Error {
			_, err := s.Status(t.Context(), p)
			return err
		},
		"ListUsers": func(s *Service, p *access.Principal) errors.Error {
			_, err := s.ListUsers(t.Context(), p, ListQuery{Page: 1, PageSize: 20})
			return err
		},
		"CreateUser": func(s *Service, p *access.Principal) errors.Error {
			_, err := s.CreateUser(t.Context(), p, "a", CreateUserInput{Email: "n@example.com", Name: "N", Role: "Viewer", Password: testPassword})
			return err
		},
		"PatchUser": func(s *Service, p *access.Principal) errors.Error {
			_, err := s.PatchUser(t.Context(), p, "a", 2, PatchUserInput{Name: str2("x")})
			return err
		},
		"SetUserProjects": func(s *Service, p *access.Principal) errors.Error {
			_, err := s.SetUserProjects(t.Context(), p, "a", 2, ProjectsInput{ProjectNames: []string{}})
			return err
		},
		"SetUserPassword": func(s *Service, p *access.Principal) errors.Error {
			return s.SetUserPassword(t.Context(), p, "a", 2, PasswordInput{Password: testPassword})
		},
		"DeleteUser": func(s *Service, p *access.Principal) errors.Error {
			return s.DeleteUser(t.Context(), p, "a", 2)
		},
		"ClearOrphan": func(s *Service, p *access.Principal) errors.Error {
			return s.ClearOrphan(t.Context(), p, "a", "ghost@example.com")
		},
	}
	for methodName, call := range methods {
		for principalName, principal := range principals {
			t.Run(methodName+"/"+principalName, func(t *testing.T) {
				f := newFakeGrafana(t)
				seedDirectory(f)
				err := call(f.service(t, nil, seedMappings()), principal)
				if err == nil || err.GetType() != errors.Forbidden {
					t.Fatalf("err = %v, want Forbidden", err)
				}
				if n := len(f.recorded()); n != 0 {
					t.Fatalf("Grafana received %d requests", n)
				}
			})
		}
	}
}

func TestListUsersOmitsPlaceholderLastSeenAt(t *testing.T) {
	f := newFakeGrafana(t)
	f.orgUsers = []grafanaOrgUser{
		{UserID: 2, Login: "never@example.com", Email: "never@example.com", Role: "Viewer", Created: "2026-10-09T12:00:00Z", LastSeenAt: "2016-10-09T12:01:08Z"},
		{UserID: 3, Login: "seen@example.com", Email: "seen@example.com", Role: "Viewer", Created: "2026-10-01T12:00:00Z", LastSeenAt: "2026-10-08T09:00:00Z"},
		{UserID: 4, Login: "junk@example.com", Email: "junk@example.com", Role: "Viewer", LastSeenAt: "not-a-time"},
	}
	f.globalUsers = []grafanaGlobalUser{
		{ID: 2, Login: "never@example.com", Email: "never@example.com"},
		{ID: 3, Login: "seen@example.com", Email: "seen@example.com"},
		{ID: 4, Login: "junk@example.com", Email: "junk@example.com"},
	}
	service := f.service(t, nil, seedMappings())

	result, err := service.ListUsers(t.Context(), customerAdmin(), ListQuery{Page: 1, PageSize: 20})
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, u := range result.Users {
		raw, err := json.Marshal(u)
		if err != nil {
			t.Fatal(err)
		}
		var fields map[string]any
		if err := json.Unmarshal(raw, &fields); err != nil {
			t.Fatal(err)
		}
		if v, ok := fields["lastSeenAt"]; ok {
			got[u.Email], _ = v.(string)
		} else {
			got[u.Email] = "<omitted>"
		}
	}
	want := map[string]string{"never@example.com": "<omitted>", "seen@example.com": "2026-10-08T09:00:00Z", "junk@example.com": "<omitted>"}
	for email, w := range want {
		if got[email] != w {
			t.Errorf("%s lastSeenAt = %q, want %q", email, got[email], w)
		}
	}
}
