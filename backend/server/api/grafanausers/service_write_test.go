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
	"net/http"
	"strings"
	"testing"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
)

const testPassword = "correct-horse-battery-staple"

type fixture struct {
	f *fakeGrafana
	m *fakeMappings
	a *fakeAudit
	s *Service
}

func newFixture(t *testing.T) *fixture {
	f := newFakeGrafana(t)
	seedAccounts(f)
	m := &fakeMappings{projects: map[string]bool{"alpha": true, "beta": true, "zeta": true}, rows: []*models.UserProjectMapping{
		{UserLogin: "alice@example.com", ProjectName: "zeta"},
		{UserLogin: "alice@example.com", ProjectName: "alpha"},
		{UserLogin: "bob@example.com", ProjectName: "beta"},
	}}
	a := &fakeAudit{}
	return &fixture{f: f, m: m, a: a, s: f.serviceWithAudit(t, nil, m, a)}
}

func seedAccounts(f *fakeGrafana) {
	f.put(fakeUser{grafanaUser: grafanaUser{ID: 1, Login: fakeManagementUser, Email: "svc@example.com", Name: "Service", IsGrafanaAdmin: true}, role: roleViewer})
	f.put(fakeUser{grafanaUser: grafanaUser{ID: 2, Login: "alice@example.com", Email: "alice@example.com", Name: "Alice"}, role: roleEditor})
	f.put(fakeUser{grafanaUser: grafanaUser{ID: 3, Login: "carol@example.com", Email: "carol@example.com", Name: "Carol", IsExternal: true, AuthLabels: []string{"Google"}}, role: roleViewer})
	f.put(fakeUser{grafanaUser: grafanaUser{ID: 4, Login: "root", Email: "root@localhost", Name: "Root", IsGrafanaAdmin: true}, role: roleAdmin})
	f.put(fakeUser{grafanaUser: grafanaUser{ID: 5, Login: "bob@example.com", Email: "bob@example.com", Name: "Bob"}, role: roleAdmin})
}

func (fx *fixture) writes() []recordedRequest {
	var out []recordedRequest
	for _, r := range fx.f.recorded() {
		if r.method != http.MethodGet {
			out = append(out, r)
		}
	}
	return out
}

func (fx *fixture) requestsMatching(method, path string) []recordedRequest {
	var out []recordedRequest
	for _, r := range fx.f.recorded() {
		if r.method == method && r.path == path {
			out = append(out, r)
		}
	}
	return out
}

func (fx *fixture) noWrites(t *testing.T) {
	t.Helper()
	if w := fx.writes(); len(w) != 0 {
		t.Fatalf("unexpected Grafana writes: %#v", w)
	}
}

func wantCode(t *testing.T, err errors.Error, kind *errors.Type, code string) {
	t.Helper()
	if err == nil {
		t.Fatalf("want error %s, got nil", code)
	}
	if err.GetType() != kind || errorCode(err) != code {
		t.Fatalf("err = %v (type http %d, code %q), want http %d code %q", err, err.GetType().GetHttpCode(), errorCode(err), kind.GetHttpCode(), code)
	}
	for _, text := range []string{err.Error(), err.Messages().Get()} {
		if strings.Contains(text, fakeBodySecret) || strings.Contains(text, fakeManagementPassword) || strings.Contains(text, testPassword) {
			t.Fatalf("error leaks text: %q", text)
		}
	}
}

func wantPartial(t *testing.T, err errors.Error, userID int64) {
	t.Helper()
	data, ok := err.GetData().(partialData)
	if err == nil || !ok || data.userID != userID || err.GetType().GetHttpCode() != http.StatusBadGateway {
		t.Fatalf("err = %v, want partial for user %d", err, userID)
	}
}

func str2(ptr string) *string { return &ptr }
func flag(v bool) *bool       { return &v }

func TestCreateUserWhenTheOrgAlreadyHasTheAccountAsViewer(t *testing.T) {
	fx := newFixture(t)
	user, err := fx.s.CreateUser(t.Context(), customerAdmin(), "admin@devlake", CreateUserInput{
		Email: "  New.User@Example.com ", Name: " New User ", Role: "Viewer", ProjectNames: []string{"beta", "alpha", "beta"}, Password: testPassword,
	})
	if err != nil {
		t.Fatal(err)
	}
	created := fx.requestsMatching(http.MethodPost, "/api/admin/users")
	if len(created) != 1 || created[0].body["login"] != "new.user@example.com" || created[0].body["email"] != "new.user@example.com" ||
		created[0].body["name"] != "New User" || created[0].body["password"] != testPassword || created[0].user != fakeManagementUser {
		t.Fatalf("create request = %#v", created)
	}
	if len(fx.writes()) != 1 {
		t.Fatalf("writes = %#v, want only the create", fx.writes())
	}
	if user.ID != 101 || user.Role != "Viewer" || user.Email != "new.user@example.com" || user.Protected || user.SSO || strings.Join(user.Projects, ",") != "alpha,beta" {
		t.Fatalf("user = %#v", user)
	}
	if got := strings.Join(fx.m.loginProjects("new.user@example.com"), ","); got != "alpha,beta" {
		t.Fatalf("stored projects = %q", got)
	}
	event := fx.a.last(t)
	if event.action != "grafana_user.create" || event.actor != "admin@devlake" || event.target != "new.user@example.com" ||
		!strings.Contains(event.detail, "grafana_id=101 login=new.user@example.com") || !strings.Contains(event.detail, "role=Viewer") {
		t.Fatalf("event = %#v", event)
	}
}

func TestCreateUserSetsANonViewerRole(t *testing.T) {
	fx := newFixture(t)
	user, err := fx.s.CreateUser(t.Context(), customerAdmin(), "a", CreateUserInput{Email: "ed@example.com", Name: "Ed", Role: "Editor", Password: testPassword})
	if err != nil {
		t.Fatal(err)
	}
	patched := fx.requestsMatching(http.MethodPatch, "/api/orgs/7/users/101")
	if len(patched) != 1 || patched[0].body["role"] != "Editor" || user.Role != "Editor" || user.Projects == nil || len(user.Projects) != 0 {
		t.Fatalf("patched = %#v, user = %#v", patched, user)
	}
}

func TestCreateUserAddsAnAccountThatIsMissingFromTheOrg(t *testing.T) {
	fx := newFixture(t)
	fx.f.noAutoJoin = true
	user, err := fx.s.CreateUser(t.Context(), customerAdmin(), "a", CreateUserInput{Email: "ed@example.com", Name: "Ed", Role: "Admin", Password: testPassword})
	if err != nil {
		t.Fatal(err)
	}
	added := fx.requestsMatching(http.MethodPost, "/api/orgs/7/users")
	if len(added) != 1 || added[0].body["loginOrEmail"] != "ed@example.com" || added[0].body["role"] != "Admin" || user.Role != "Admin" {
		t.Fatalf("added = %#v, user = %#v", added, user)
	}
	if len(fx.requestsMatching(http.MethodPatch, "/api/orgs/7/users/101")) != 0 {
		t.Fatal("role was patched as well as added")
	}
}

func TestCreateUserReplacesStaleRowsStoredUnderTheEmail(t *testing.T) {
	fx := newFixture(t)
	fx.m.rows = append(fx.m.rows, &models.UserProjectMapping{UserLogin: "new@example.com", ProjectName: "zeta"})
	if _, err := fx.s.CreateUser(t.Context(), customerAdmin(), "a", CreateUserInput{Email: "new@example.com", Name: "N", Role: "Viewer", ProjectNames: []string{"alpha"}, Password: testPassword}); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(fx.m.loginProjects("new@example.com"), ","); got != "alpha" {
		t.Fatalf("projects = %q, want only alpha", got)
	}
}

func TestCreateUserGrafanaFailures(t *testing.T) {
	t.Run("account exists", func(t *testing.T) {
		fx := newFixture(t)
		_, err := fx.s.CreateUser(t.Context(), customerAdmin(), "a", CreateUserInput{Email: "alice@example.com", Name: "A", Role: "Viewer", Password: testPassword})
		wantCode(t, err, errors.Conflict, ErrCodeUserExists)
		if len(fx.writes()) != 1 || len(fx.m.calls) != 0 {
			t.Fatalf("writes = %#v, mapping calls = %v", fx.writes(), fx.m.calls)
		}
	})
	t.Run("password rejected", func(t *testing.T) {
		fx := newFixture(t)
		fx.f.forced["POST /api/admin/users"] = http.StatusBadRequest
		_, err := fx.s.CreateUser(t.Context(), customerAdmin(), "a", CreateUserInput{Email: "n@example.com", Name: "N", Role: "Viewer", Password: testPassword})
		wantCode(t, err, errors.BadInput, ErrCodePasswordBad)
	})
	t.Run("server error", func(t *testing.T) {
		fx := newFixture(t)
		fx.f.forced["POST /api/admin/users"] = http.StatusInternalServerError
		_, err := fx.s.CreateUser(t.Context(), customerAdmin(), "a", CreateUserInput{Email: "n@example.com", Name: "N", Role: "Viewer", Password: testPassword})
		assertUnavailable(t, err)
	})
}

func TestCreateUserPartialAfterRoleFailureKeepsTheAccount(t *testing.T) {
	fx := newFixture(t)
	fx.f.forced["PATCH /api/orgs/7/users/101"] = http.StatusInternalServerError
	_, err := fx.s.CreateUser(t.Context(), customerAdmin(), "a", CreateUserInput{Email: "n@example.com", Name: "N", Role: "Editor", ProjectNames: []string{"alpha"}, Password: testPassword})
	wantPartial(t, err, 101)
	if len(fx.requestsMatching(http.MethodDelete, "/api/admin/users/101")) != 0 {
		t.Fatal("account was deleted to roll back")
	}
	if len(fx.m.calls) != 0 {
		t.Fatalf("mappings written after the role failed: %v", fx.m.calls)
	}
	if event := fx.a.last(t); event.action != "grafana_user.create" || !strings.Contains(event.detail, "partial=true") {
		t.Fatalf("event = %#v", event)
	}
}

func TestCreateUserPartialAfterMappingFailureKeepsTheAccount(t *testing.T) {
	fx := newFixture(t)
	fx.m.replaceErr = errors.Default.New("db down")
	_, err := fx.s.CreateUser(t.Context(), customerAdmin(), "a", CreateUserInput{Email: "n@example.com", Name: "N", Role: "Viewer", ProjectNames: []string{"alpha"}, Password: testPassword})
	wantPartial(t, err, 101)
	if len(fx.requestsMatching(http.MethodDelete, "/api/admin/users/101")) != 0 {
		t.Fatal("account was deleted to roll back")
	}
}

func TestCreateUserValidationMakesNoRequests(t *testing.T) {
	long := strings.Repeat("a", passwordMaximumBytes+1)
	cases := []struct {
		name  string
		input CreateUserInput
		kind  *errors.Type
		code  string
	}{
		{"empty email", CreateUserInput{Email: " ", Name: "N", Role: "Viewer", Password: testPassword}, errors.BadInput, ""},
		{"display name", CreateUserInput{Email: "Bob <bob@example.com>", Name: "N", Role: "Viewer", Password: testPassword}, errors.BadInput, ""},
		{"not an email", CreateUserInput{Email: "bob", Name: "N", Role: "Viewer", Password: testPassword}, errors.BadInput, ""},
		{"empty name", CreateUserInput{Email: "b@example.com", Name: "  ", Role: "Viewer", Password: testPassword}, errors.BadInput, ""},
		{"bad role", CreateUserInput{Email: "b@example.com", Name: "N", Role: "None", Password: testPassword}, errors.BadInput, ""},
		{"short password", CreateUserInput{Email: "b@example.com", Name: "N", Role: "Viewer", Password: "short"}, errors.BadInput, ErrCodePasswordShort},
		{"14 characters", CreateUserInput{Email: "b@example.com", Name: "N", Role: "Viewer", Password: "12345678901234"}, errors.BadInput, ErrCodePasswordShort},
		{"too long", CreateUserInput{Email: "b@example.com", Name: "N", Role: "Viewer", Password: long}, errors.BadInput, ""},
		{"unknown project", CreateUserInput{Email: "b@example.com", Name: "N", Role: "Viewer", Password: testPassword, ProjectNames: []string{"alpha", "nope"}}, errors.BadInput, ErrCodeProjectMissing},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newFixture(t)
			_, err := fx.s.CreateUser(t.Context(), customerAdmin(), "a", tc.input)
			wantCode(t, err, tc.kind, tc.code)
			if n := len(fx.f.recorded()); n != 0 {
				t.Fatalf("validation failure reached Grafana with %d requests", n)
			}
		})
	}
	t.Run("15 characters counted by runes", func(t *testing.T) {
		fx := newFixture(t)
		if _, err := fx.s.CreateUser(t.Context(), customerAdmin(), "a", CreateUserInput{Email: "b@example.com", Name: "N", Role: "Viewer", Password: strings.Repeat("é", 15)}); err != nil {
			t.Fatal(err)
		}
	})
}

func TestPatchUserEmailChangeMovesMappingsAndSendsTheNewLogin(t *testing.T) {
	fx := newFixture(t)
	fx.m.rows = append(fx.m.rows, &models.UserProjectMapping{UserLogin: "new@example.com", ProjectName: "stale"})
	user, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Email: str2(" New@Example.com ")})
	if err != nil {
		t.Fatal(err)
	}
	put := fx.requestsMatching(http.MethodPut, "/api/users/2")
	if len(put) != 1 || put[0].body["login"] != "new@example.com" || put[0].body["email"] != "new@example.com" || put[0].body["name"] != "Alice" {
		t.Fatalf("put = %#v", put)
	}
	if user.Email != "new@example.com" || strings.Join(user.Projects, ",") != "alpha,zeta" {
		t.Fatalf("user = %#v", user)
	}
	if len(fx.m.loginProjects("alice@example.com")) != 0 || strings.Join(fx.m.loginProjects("new@example.com"), ",") != "alpha,zeta" {
		t.Fatalf("rows = %v", fx.m.rows)
	}
	event := fx.a.last(t)
	if event.action != "grafana_user.profile" || event.target != "new@example.com" ||
		!strings.Contains(event.detail, "email=alice@example.com->new@example.com dropped_rows=1") || !strings.Contains(event.detail, "login=new@example.com") {
		t.Fatalf("event = %#v", event)
	}
}

func TestPatchUserEmailChangeRollsBackWhenGrafanaFails(t *testing.T) {
	t.Run("412", func(t *testing.T) {
		fx := newFixture(t)
		_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Email: str2("bob@example.com")})
		wantCode(t, err, errors.Conflict, ErrCodeUserExists)
		if strings.Join(fx.m.loginProjects("alice@example.com"), ",") != "alpha,zeta" || strings.Join(fx.m.loginProjects("bob@example.com"), ",") != "beta" {
			t.Fatalf("rows not restored: %v", fx.m.rows)
		}
		if len(fx.a.events) != 0 {
			t.Fatalf("events = %#v", fx.a.events)
		}
	})
	t.Run("500", func(t *testing.T) {
		fx := newFixture(t)
		fx.f.forced["PUT /api/users/2"] = http.StatusInternalServerError
		_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Email: str2("new@example.com")})
		assertUnavailable(t, err)
		if strings.Join(fx.m.loginProjects("alice@example.com"), ",") != "alpha,zeta" || len(fx.m.loginProjects("new@example.com")) != 0 {
			t.Fatalf("rows not restored: %v", fx.m.rows)
		}
	})
	t.Run("403 maps to sso managed", func(t *testing.T) {
		fx := newFixture(t)
		fx.f.forced["PUT /api/users/2"] = http.StatusForbidden
		_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Name: str2("Alice B")})
		wantCode(t, err, errors.Conflict, ErrCodeUserSSOManaged)
	})
}

func TestPatchUserNormalisesALegacyLoginWhenTheEmailIsSentUnchanged(t *testing.T) {
	fx := newFixture(t)
	fx.f.users[2].Login = "alice"
	fx.m.rows = []*models.UserProjectMapping{{UserLogin: "alice", ProjectName: "alpha"}}
	if _, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Email: str2("alice@example.com")}); err != nil {
		t.Fatal(err)
	}
	put := fx.requestsMatching(http.MethodPut, "/api/users/2")
	if len(put) != 1 || put[0].body["login"] != "alice@example.com" {
		t.Fatalf("put = %#v", put)
	}
	if strings.Join(fx.m.loginProjects("alice@example.com"), ",") != "alpha" || len(fx.m.loginProjects("alice")) != 0 {
		t.Fatalf("rows = %v", fx.m.rows)
	}
}

func TestPatchUserNameOnlyKeepsEmailLoginAndMappings(t *testing.T) {
	fx := newFixture(t)
	fx.f.users[2].Login = "alice"
	user, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Name: str2("  Alice Smith ")})
	if err != nil {
		t.Fatal(err)
	}
	put := fx.requestsMatching(http.MethodPut, "/api/users/2")
	if len(put) != 1 || put[0].body["name"] != "Alice Smith" || put[0].body["email"] != "alice@example.com" || put[0].body["login"] != "alice" {
		t.Fatalf("put = %#v", put)
	}
	if len(fx.m.calls) != 0 || user.Name != "Alice Smith" {
		t.Fatalf("mapping calls = %v, user = %#v", fx.m.calls, user)
	}
}

func TestPatchUserRoleAndDisabled(t *testing.T) {
	fx := newFixture(t)
	user, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Role: str2("Viewer"), Disabled: flag(true)})
	if err != nil {
		t.Fatal(err)
	}
	if user.Role != "Viewer" || !user.Disabled {
		t.Fatalf("user = %#v", user)
	}
	if len(fx.a.events) != 2 || fx.a.events[0].action != "grafana_user.role" || !strings.Contains(fx.a.events[0].detail, "role=Editor->Viewer") || fx.a.events[1].action != "grafana_user.disable" {
		t.Fatalf("events = %#v", fx.a.events)
	}
	if _, err = fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Disabled: flag(false)}); err != nil {
		t.Fatal(err)
	}
	if fx.a.last(t).action != "grafana_user.enable" || len(fx.requestsMatching(http.MethodPost, "/api/admin/users/2/enable")) != 1 {
		t.Fatalf("events = %#v", fx.a.events)
	}
}

func TestPatchUserAddsAnAccountOutsideTheOrgWhenGivenARole(t *testing.T) {
	fx := newFixture(t)
	fx.f.users[2].role = ""
	if _, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Role: str2("Editor")}); err != nil {
		t.Fatal(err)
	}
	if len(fx.requestsMatching(http.MethodPost, "/api/orgs/7/users")) != 1 {
		t.Fatalf("writes = %#v", fx.writes())
	}
}

func TestPatchUserWithNothingToChangeWritesNothing(t *testing.T) {
	fx := newFixture(t)
	_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Name: str2("Alice"), Email: str2("ALICE@example.com"), Role: str2("Editor"), Disabled: flag(false)})
	if err != nil {
		t.Fatal(err)
	}
	fx.noWrites(t)
	if len(fx.a.events) != 0 {
		t.Fatalf("events = %#v", fx.a.events)
	}
	_, err = fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{})
	wantCode(t, err, errors.BadInput, "")
}

func TestProtectedAccountsRefuseWritesWithoutTouchingGrafana(t *testing.T) {
	writes := map[string]func(fx *fixture, id int64) errors.Error{
		"rename": func(fx *fixture, id int64) errors.Error {
			_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", id, PatchUserInput{Name: str2("Other")})
			return err
		},
		"email": func(fx *fixture, id int64) errors.Error {
			_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", id, PatchUserInput{Email: str2("x@example.com")})
			return err
		},
		"role": func(fx *fixture, id int64) errors.Error {
			_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", id, PatchUserInput{Role: str2("Viewer")})
			return err
		},
		"disable": func(fx *fixture, id int64) errors.Error {
			_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", id, PatchUserInput{Disabled: flag(true)})
			return err
		},
		"password": func(fx *fixture, id int64) errors.Error {
			return fx.s.SetUserPassword(t.Context(), customerAdmin(), "a", id, PasswordInput{Password: testPassword})
		},
		"delete": func(fx *fixture, id int64) errors.Error {
			return fx.s.DeleteUser(t.Context(), customerAdmin(), "a", id)
		},
	}
	for name, write := range writes {
		for target, id := range map[string]int64{"management identity": 1, "server admin": 4} {
			t.Run(name+"/"+target, func(t *testing.T) {
				fx := newFixture(t)
				wantCode(t, write(fx, id), errors.Forbidden, ErrCodeUserProtected)
				fx.noWrites(t)
				if len(fx.m.calls) != 0 || len(fx.a.events) != 0 {
					t.Fatalf("mapping calls = %v, events = %v", fx.m.calls, fx.a.events)
				}
			})
		}
	}
}

func TestProjectsOfProtectedAccounts(t *testing.T) {
	t.Run("management identity refused", func(t *testing.T) {
		fx := newFixture(t)
		_, err := fx.s.SetUserProjects(t.Context(), customerAdmin(), "a", 1, ProjectsInput{ProjectNames: []string{"alpha"}})
		wantCode(t, err, errors.Forbidden, ErrCodeUserProtected)
		if len(fx.m.calls) != 0 {
			t.Fatalf("mapping calls = %v", fx.m.calls)
		}
	})
	t.Run("other server admin allowed", func(t *testing.T) {
		fx := newFixture(t)
		user, err := fx.s.SetUserProjects(t.Context(), customerAdmin(), "a", 4, ProjectsInput{ProjectNames: []string{"alpha"}})
		if err != nil || !user.Protected || strings.Join(user.Projects, ",") != "alpha" {
			t.Fatalf("user = %#v, err = %v", user, err)
		}
		fx.noWrites(t)
	})
}

func TestSSOAccountsRefuseProfileAndPasswordButAllowTheRest(t *testing.T) {
	fx := newFixture(t)
	_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 3, PatchUserInput{Name: str2("Carol B")})
	wantCode(t, err, errors.Conflict, ErrCodeUserSSOManaged)
	_, err = fx.s.PatchUser(t.Context(), customerAdmin(), "a", 3, PatchUserInput{Email: str2("c2@example.com")})
	wantCode(t, err, errors.Conflict, ErrCodeUserSSOManaged)
	wantCode(t, fx.s.SetUserPassword(t.Context(), customerAdmin(), "a", 3, PasswordInput{Password: testPassword}), errors.Conflict, ErrCodeUserSSOManaged)
	fx.noWrites(t)

	user, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 3, PatchUserInput{Role: str2("Editor"), Disabled: flag(true)})
	if err != nil || !user.SSO || user.Role != "Editor" || !user.Disabled {
		t.Fatalf("user = %#v, err = %v", user, err)
	}
	if _, err = fx.s.SetUserProjects(t.Context(), customerAdmin(), "a", 3, ProjectsInput{ProjectNames: []string{"beta"}}); err != nil {
		t.Fatal(err)
	}
	if err = fx.s.DeleteUser(t.Context(), customerAdmin(), "a", 3); err != nil {
		t.Fatal(err)
	}
}

func TestLastAdminGuard(t *testing.T) {
	soleAdmin := func(t *testing.T) *fixture {
		fx := newFixture(t)
		fx.f.users[4].role = roleViewer
		fx.f.setOrgUser(fx.f.users[4])
		return fx
	}
	attempts := map[string]func(fx *fixture) errors.Error{
		"demote": func(fx *fixture) errors.Error {
			_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 5, PatchUserInput{Role: str2("Editor")})
			return err
		},
		"disable": func(fx *fixture) errors.Error {
			_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 5, PatchUserInput{Disabled: flag(true)})
			return err
		},
		"delete": func(fx *fixture) errors.Error { return fx.s.DeleteUser(t.Context(), customerAdmin(), "a", 5) },
	}
	for name, attempt := range attempts {
		t.Run(name+"/refused", func(t *testing.T) {
			fx := soleAdmin(t)
			wantCode(t, attempt(fx), errors.Conflict, ErrCodeLastAdmin)
			fx.noWrites(t)
			if len(fx.m.calls) != 0 {
				t.Fatalf("mapping calls = %v", fx.m.calls)
			}
		})
		t.Run(name+"/another enabled admin exists", func(t *testing.T) {
			fx := newFixture(t)
			if err := attempt(fx); err != nil {
				t.Fatal(err)
			}
		})
		t.Run(name+"/a disabled admin does not count", func(t *testing.T) {
			fx := newFixture(t)
			fx.f.users[4].IsDisabled = true
			fx.f.setOrgUser(fx.f.users[4])
			wantCode(t, attempt(fx), errors.Conflict, ErrCodeLastAdmin)
			fx.noWrites(t)
		})
	}
	t.Run("a disabled admin may be deleted", func(t *testing.T) {
		fx := soleAdmin(t)
		fx.f.users[5].IsDisabled = true
		fx.f.setOrgUser(fx.f.users[5])
		if err := fx.s.DeleteUser(t.Context(), customerAdmin(), "a", 5); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("paging through every org user", func(t *testing.T) {
		fx := soleAdmin(t)
		wantCode(t, fx.s.DeleteUser(t.Context(), customerAdmin(), "a", 5), errors.Conflict, ErrCodeLastAdmin)
		search := fx.f.requestsTo("/api/orgs/7/users/search")
		if len(search) != 1 || search[0].query.Get("perpage") != "1000" || search[0].query.Get("page") != "1" {
			t.Fatalf("search = %#v", search)
		}
	})
}

func TestIdRoutesReportUnknownAccountsAndBadIds(t *testing.T) {
	calls := map[string]func(fx *fixture, id int64) errors.Error{
		"patch": func(fx *fixture, id int64) errors.Error {
			_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", id, PatchUserInput{Name: str2("x")})
			return err
		},
		"projects": func(fx *fixture, id int64) errors.Error {
			_, err := fx.s.SetUserProjects(t.Context(), customerAdmin(), "a", id, ProjectsInput{ProjectNames: []string{}})
			return err
		},
		"password": func(fx *fixture, id int64) errors.Error {
			return fx.s.SetUserPassword(t.Context(), customerAdmin(), "a", id, PasswordInput{Password: testPassword})
		},
		"delete": func(fx *fixture, id int64) errors.Error {
			return fx.s.DeleteUser(t.Context(), customerAdmin(), "a", id)
		},
	}
	for name, call := range calls {
		t.Run(name, func(t *testing.T) {
			fx := newFixture(t)
			wantCode(t, call(fx, 999), errors.NotFound, ErrCodeUserNotFound)
			wantCode(t, call(fx, 0), errors.BadInput, "")
			wantCode(t, call(fx, -3), errors.BadInput, "")
			fx.noWrites(t)
		})
	}
}

func TestSetUserProjectsReplacesTheSetAndAudits(t *testing.T) {
	fx := newFixture(t)
	user, err := fx.s.SetUserProjects(t.Context(), customerAdmin(), "boss", 2, ProjectsInput{ProjectNames: []string{"beta", "alpha", "beta"}})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(user.Projects, ",") != "alpha,beta" || strings.Join(fx.m.loginProjects("alice@example.com"), ",") != "alpha,beta" {
		t.Fatalf("user = %#v rows = %v", user, fx.m.rows)
	}
	event := fx.a.last(t)
	if event.action != "grafana_user.projects" || event.actor != "boss" || !strings.Contains(event.detail, "projects +beta -zeta") {
		t.Fatalf("event = %#v", event)
	}
	fx.noWrites(t)

	user, err = fx.s.SetUserProjects(t.Context(), customerAdmin(), "boss", 2, ProjectsInput{ProjectNames: []string{}})
	if err != nil || len(user.Projects) != 0 || user.Projects == nil {
		t.Fatalf("user = %#v, err = %v", user, err)
	}
	_, err = fx.s.SetUserProjects(t.Context(), customerAdmin(), "boss", 2, ProjectsInput{})
	wantCode(t, err, errors.BadInput, "")
	_, err = fx.s.SetUserProjects(t.Context(), customerAdmin(), "boss", 2, ProjectsInput{ProjectNames: []string{"nope"}})
	wantCode(t, err, errors.BadInput, ErrCodeProjectMissing)
}

func TestSetUserPasswordRules(t *testing.T) {
	t.Run("sets the password and audits without it", func(t *testing.T) {
		fx := newFixture(t)
		if err := fx.s.SetUserPassword(t.Context(), customerAdmin(), "a", 2, PasswordInput{Password: testPassword}); err != nil {
			t.Fatal(err)
		}
		put := fx.requestsMatching(http.MethodPut, "/api/admin/users/2/password")
		if len(put) != 1 || put[0].body["password"] != testPassword {
			t.Fatalf("put = %#v", put)
		}
		if event := fx.a.last(t); event.action != "grafana_user.password" || strings.Contains(event.detail, testPassword) {
			t.Fatalf("event = %#v", event)
		}
	})
	t.Run("too short", func(t *testing.T) {
		fx := newFixture(t)
		wantCode(t, fx.s.SetUserPassword(t.Context(), customerAdmin(), "a", 2, PasswordInput{Password: "short"}), errors.BadInput, ErrCodePasswordShort)
		fx.noWrites(t)
	})
	t.Run("too long", func(t *testing.T) {
		fx := newFixture(t)
		wantCode(t, fx.s.SetUserPassword(t.Context(), customerAdmin(), "a", 2, PasswordInput{Password: strings.Repeat("x", passwordMaximumBytes+1)}), errors.BadInput, "")
		fx.noWrites(t)
	})
	t.Run("Grafana rejects it", func(t *testing.T) {
		fx := newFixture(t)
		fx.f.forced["PUT /api/admin/users/2/password"] = http.StatusBadRequest
		wantCode(t, fx.s.SetUserPassword(t.Context(), customerAdmin(), "a", 2, PasswordInput{Password: testPassword}), errors.BadInput, ErrCodePasswordBad)
	})
	t.Run("Grafana fails", func(t *testing.T) {
		fx := newFixture(t)
		fx.f.forced["PUT /api/admin/users/2/password"] = http.StatusInternalServerError
		assertUnavailable(t, fx.s.SetUserPassword(t.Context(), customerAdmin(), "a", 2, PasswordInput{Password: testPassword}))
	})
}

func TestDeleteUser(t *testing.T) {
	t.Run("removes the account and its mappings", func(t *testing.T) {
		fx := newFixture(t)
		if err := fx.s.DeleteUser(t.Context(), customerAdmin(), "a", 2); err != nil {
			t.Fatal(err)
		}
		if len(fx.requestsMatching(http.MethodDelete, "/api/admin/users/2")) != 1 || len(fx.m.loginProjects("alice@example.com")) != 0 {
			t.Fatalf("writes = %#v rows = %v", fx.writes(), fx.m.rows)
		}
		if event := fx.a.last(t); event.action != "grafana_user.delete" || !strings.Contains(event.detail, "grafana_id=2 login=alice@example.com") {
			t.Fatalf("event = %#v", event)
		}
	})
	t.Run("Grafana 500 rolls the mappings back", func(t *testing.T) {
		fx := newFixture(t)
		fx.f.forced["DELETE /api/admin/users/2"] = http.StatusInternalServerError
		assertUnavailable(t, fx.s.DeleteUser(t.Context(), customerAdmin(), "a", 2))
		if strings.Join(fx.m.loginProjects("alice@example.com"), ",") != "alpha,zeta" || len(fx.a.events) != 0 {
			t.Fatalf("rows = %v events = %v", fx.m.rows, fx.a.events)
		}
	})
	t.Run("Grafana 404 on the delete call commits", func(t *testing.T) {
		fx := newFixture(t)
		fx.f.forced["DELETE /api/admin/users/2"] = http.StatusNotFound
		if err := fx.s.DeleteUser(t.Context(), customerAdmin(), "a", 2); err != nil {
			t.Fatal(err)
		}
		if len(fx.m.loginProjects("alice@example.com")) != 0 {
			t.Fatalf("rows = %v", fx.m.rows)
		}
	})
}

func TestClearOrphan(t *testing.T) {
	t.Run("refused when the exact login exists", func(t *testing.T) {
		fx := newFixture(t)
		wantCode(t, fx.s.ClearOrphan(t.Context(), customerAdmin(), "a", "alice@example.com"), errors.Conflict, ErrCodeUserExists)
		if len(fx.m.calls) != 0 {
			t.Fatalf("mapping calls = %v", fx.m.calls)
		}
		look := fx.f.requestsTo("/api/users/lookup")
		if len(look) != 1 || look[0].query.Get("loginOrEmail") != "alice@example.com" {
			t.Fatalf("lookup = %#v", look)
		}
	})
	t.Run("allowed when lookup finds a different login by email", func(t *testing.T) {
		fx := newFixture(t)
		fx.f.users[2].Login = "alice"
		fx.m.rows = append(fx.m.rows, &models.UserProjectMapping{UserLogin: "alice@example.com", ProjectName: "alpha"})
		if err := fx.s.ClearOrphan(t.Context(), customerAdmin(), "boss", "alice@example.com"); err != nil {
			t.Fatal(err)
		}
		if len(fx.m.loginProjects("alice@example.com")) != 0 {
			t.Fatalf("rows = %v", fx.m.rows)
		}
		if event := fx.a.last(t); event.action != "grafana_orphan.clear" || event.target != "alice@example.com" {
			t.Fatalf("event = %#v", event)
		}
	})
	t.Run("unknown account with no rows is a no-op", func(t *testing.T) {
		fx := newFixture(t)
		if err := fx.s.ClearOrphan(t.Context(), customerAdmin(), "a", "ghost@example.com"); err != nil {
			t.Fatal(err)
		}
		fx.noWrites(t)
	})
	t.Run("lookup failure keeps the rows", func(t *testing.T) {
		fx := newFixture(t)
		fx.f.forced["GET /api/users/lookup"] = http.StatusInternalServerError
		assertUnavailable(t, fx.s.ClearOrphan(t.Context(), customerAdmin(), "a", "ghost@example.com"))
		if len(fx.m.calls) != 0 {
			t.Fatalf("mapping calls = %v", fx.m.calls)
		}
	})
	t.Run("empty account", func(t *testing.T) {
		fx := newFixture(t)
		wantCode(t, fx.s.ClearOrphan(t.Context(), customerAdmin(), "a", ""), errors.BadInput, "")
		if len(fx.f.recorded()) != 0 {
			t.Fatal("empty account reached Grafana")
		}
	})
}

func TestWritesWhenGrafanaIsNotConfigured(t *testing.T) {
	s := newServiceWithDependencies(nil, "", &fakeMappings{projects: map[string]bool{}}, nil)
	calls := map[string]func() errors.Error{
		"create": func() errors.Error {
			_, err := s.CreateUser(t.Context(), customerAdmin(), "a", CreateUserInput{Email: "n@example.com", Name: "N", Role: "Viewer", Password: testPassword})
			return err
		},
		"patch": func() errors.Error {
			_, err := s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Name: str2("x")})
			return err
		},
		"projects": func() errors.Error {
			_, err := s.SetUserProjects(t.Context(), customerAdmin(), "a", 2, ProjectsInput{ProjectNames: []string{}})
			return err
		},
		"password": func() errors.Error {
			return s.SetUserPassword(t.Context(), customerAdmin(), "a", 2, PasswordInput{Password: testPassword})
		},
		"delete": func() errors.Error { return s.DeleteUser(t.Context(), customerAdmin(), "a", 2) },
		"orphan": func() errors.Error { return s.ClearOrphan(t.Context(), customerAdmin(), "a", "x") },
	}
	for name, call := range calls {
		t.Run(name, func(t *testing.T) {
			wantCode(t, call(), errors.Unavailable, ErrCodeNotConfigured)
		})
	}
}

func TestEveryWriteFailsClosedOnGrafanaErrors(t *testing.T) {
	cases := []struct {
		name   string
		forced string
		status int
		call   func(fx *fixture) errors.Error
		kind   *errors.Type
		code   string
	}{
		{"read account 404", "GET /api/users/2", 404, func(fx *fixture) errors.Error {
			return fx.s.DeleteUser(t.Context(), customerAdmin(), "a", 2)
		}, errors.NotFound, ErrCodeUserNotFound},
		{"read account 500", "GET /api/users/2", 500, func(fx *fixture) errors.Error {
			return fx.s.DeleteUser(t.Context(), customerAdmin(), "a", 2)
		}, errors.Unavailable, ErrCodeUnavailable},
		{"read account 401", "GET /api/users/2", 401, func(fx *fixture) errors.Error {
			return fx.s.DeleteUser(t.Context(), customerAdmin(), "a", 2)
		}, errors.Unavailable, ErrCodeUnavailable},
		{"org memberships 500", "GET /api/users/2/orgs", 500, func(fx *fixture) errors.Error {
			_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Role: str2("Admin")})
			return err
		}, errors.Unavailable, ErrCodeUnavailable},
		{"set org role 404", "PATCH /api/orgs/7/users/2", 404, func(fx *fixture) errors.Error {
			_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Role: str2("Admin")})
			return err
		}, errors.NotFound, ErrCodeUserNotFound},
		{"set org role 500", "PATCH /api/orgs/7/users/2", 500, func(fx *fixture) errors.Error {
			_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Role: str2("Admin")})
			return err
		}, errors.Unavailable, ErrCodeUnavailable},
		{"disable 500", "POST /api/admin/users/2/disable", 500, func(fx *fixture) errors.Error {
			_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Disabled: flag(true)})
			return err
		}, errors.Unavailable, ErrCodeUnavailable},
		{"enable 500", "POST /api/admin/users/3/enable", 500, func(fx *fixture) errors.Error {
			fx.f.users[3].IsDisabled = true
			_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 3, PatchUserInput{Disabled: flag(false)})
			return err
		}, errors.Unavailable, ErrCodeUnavailable},
		{"profile 412", "PUT /api/users/2", 412, func(fx *fixture) errors.Error {
			_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Name: str2("x")})
			return err
		}, errors.Conflict, ErrCodeUserExists},
		{"profile 403", "PUT /api/users/2", 403, func(fx *fixture) errors.Error {
			_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Name: str2("x")})
			return err
		}, errors.Conflict, ErrCodeUserSSOManaged},
		{"org add 500", "POST /api/orgs/7/users", 500, func(fx *fixture) errors.Error {
			fx.f.users[2].role = ""
			_, err := fx.s.PatchUser(t.Context(), customerAdmin(), "a", 2, PatchUserInput{Role: str2("Admin")})
			return err
		}, errors.Unavailable, ErrCodeUnavailable},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fx := newFixture(t)
			fx.f.forced[tc.forced] = tc.status
			err := tc.call(fx)
			wantCode(t, err, tc.kind, tc.code)
		})
	}
}

func TestNoAuditEventCarriesThePassword(t *testing.T) {
	fx := newFixture(t)
	if _, err := fx.s.CreateUser(t.Context(), customerAdmin(), "a", CreateUserInput{Email: "n@example.com", Name: "N", Role: "Editor", ProjectNames: []string{"alpha"}, Password: testPassword}); err != nil {
		t.Fatal(err)
	}
	if err := fx.s.SetUserPassword(t.Context(), customerAdmin(), "a", 101, PasswordInput{Password: testPassword}); err != nil {
		t.Fatal(err)
	}
	if _, err := fx.s.SetUserProjects(t.Context(), customerAdmin(), "a", 101, ProjectsInput{ProjectNames: []string{"beta"}}); err != nil {
		t.Fatal(err)
	}
	if err := fx.s.DeleteUser(t.Context(), customerAdmin(), "a", 101); err != nil {
		t.Fatal(err)
	}
	actions := []string{}
	for _, event := range fx.a.events {
		actions = append(actions, event.action)
		if strings.Contains(event.detail, testPassword) || strings.Contains(event.actor+event.target, testPassword) {
			t.Fatalf("event leaks the password: %#v", event)
		}
	}
	if strings.Join(actions, ",") != "grafana_user.create,grafana_user.password,grafana_user.projects,grafana_user.delete" {
		t.Fatalf("actions = %v", actions)
	}
}
