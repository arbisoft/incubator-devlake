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

package integration

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/server/api/integration/services"
	"github.com/apache/incubator-devlake/server/api/shared"
)

const (
	mapPath    = "/integration/map-project-user"
	invitePath = "/integration/send-invite-email"
)

// fakeAccess records what Map got and returns err or a canned result.
type fakeAccess struct {
	args []string
	err  errors.Error
}

func (f *fakeAccess) Map(projectName, email, name string) (*services.ProjectUserMapping, errors.Error) {
	f.args = []string{projectName, email, name}
	if f.err != nil {
		return nil, f.err
	}
	return &services.ProjectUserMapping{ProjectName: projectName, Email: email, UserCreated: true, AccessCreated: true}, nil
}

// fakeInvites records what Send got and returns err or a queued email.
type fakeInvites struct {
	args []string
	err  errors.Error
}

func (f *fakeInvites) Send(projectName, email, sentBy string) (*services.InviteEmail, errors.Error) {
	f.args = []string{projectName, email, sentBy}
	if f.err != nil {
		return nil, f.err
	}
	return &services.InviteEmail{ID: 9, Status: "QUEUED"}, nil
}

// newOnboardingRouter registers the routes as router.go does. caller, when set, marks requests as
// RestAuthentication does for an API key.
func newOnboardingRouter(t *testing.T, access projectAccessGranter, invites inviteQueuer, caller *common.User) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	h, err := NewOnboardingHandlers(access, invites)
	if err != nil {
		t.Fatalf("NewOnboardingHandlers() error = %v", err)
	}
	r := gin.New()
	if caller != nil {
		r.Use(func(c *gin.Context) {
			c.Request = shared.SetRestAuthUser(c.Request, caller)
			c.Next()
		})
	}
	only := RequireAPIKey()
	r.POST(mapPath, only, h.PostMapProjectUser)
	r.POST(invitePath, only, h.PostSendInviteEmail)
	return r
}

func post(r *gin.Engine, path, body string) *httptest.ResponseRecorder {
	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(resp, req)
	return resp
}

var apiKeyCaller = &common.User{Name: "Integration Bot", Email: "bot@arbisoft.com"}

func TestNewOnboardingHandlersRejectsNil(t *testing.T) {
	if _, err := NewOnboardingHandlers(nil, &fakeInvites{}); err == nil {
		t.Error("NewOnboardingHandlers(nil access) error = nil, want an error")
	}
	if _, err := NewOnboardingHandlers(&fakeAccess{}, nil); err == nil {
		t.Error("NewOnboardingHandlers(nil invites) error = nil, want an error")
	}
}

func TestOnboardingRoutesNeedAnAPIKey(t *testing.T) {
	for _, path := range []string{mapPath, invitePath} {
		t.Run(path, func(t *testing.T) {
			access, invites := &fakeAccess{}, &fakeInvites{}

			resp := post(newOnboardingRouter(t, access, invites, nil), path, `{"projectName":"P","email":"a@b.com","name":"A"}`)

			if resp.Code != http.StatusUnauthorized {
				t.Errorf("POST %s without an API key = %d, want 401", path, resp.Code)
			}
			if access.args != nil || invites.args != nil {
				t.Error("the service was called without an API key")
			}
		})
	}
}

func TestPostMapProjectUser(t *testing.T) {
	access := &fakeAccess{}

	resp := post(newOnboardingRouter(t, access, &fakeInvites{}, apiKeyCaller), mapPath,
		`{"projectName":"Payments","email":"lead@arbisoft.com","name":"Ali Khan"}`)

	if resp.Code != http.StatusCreated {
		t.Fatalf("status = %d %s, want 201", resp.Code, resp.Body.String())
	}
	if want := []string{"Payments", "lead@arbisoft.com", "Ali Khan"}; !reflect.DeepEqual(access.args, want) {
		t.Errorf("Map got %q, want %q", access.args, want)
	}
	var body services.ProjectUserMapping
	if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil || !body.UserCreated || !body.AccessCreated || body.ProjectName != "Payments" {
		t.Errorf("body = %s (%v), want the mapping result", resp.Body.String(), err)
	}
}

func TestPostSendInviteEmail(t *testing.T) {
	cases := []struct {
		name       string
		caller     *common.User
		wantSentBy string
	}{
		{name: "records the key's creator", caller: apiKeyCaller, wantSentBy: "Integration Bot"},
		{name: "falls back to the creator's email", caller: &common.User{Email: "bot@arbisoft.com"}, wantSentBy: "bot@arbisoft.com"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			invites := &fakeInvites{}

			resp := post(newOnboardingRouter(t, &fakeAccess{}, invites, tc.caller), invitePath, `{"projectName":"Payments","email":"lead@arbisoft.com"}`)

			if resp.Code != http.StatusAccepted {
				t.Fatalf("status = %d %s, want 202", resp.Code, resp.Body.String())
			}
			if want := []string{"Payments", "lead@arbisoft.com", tc.wantSentBy}; !reflect.DeepEqual(invites.args, want) {
				t.Errorf("Send got %q, want %q", invites.args, want)
			}
			var body services.InviteEmail
			if err := json.Unmarshal(resp.Body.Bytes(), &body); err != nil || body.ID != 9 || body.Status != "QUEUED" {
				t.Errorf("body = %s (%v), want the queued email", resp.Body.String(), err)
			}
		})
	}
}

func TestOnboardingRoutesReturnTheErrorStatus(t *testing.T) {
	cases := []struct {
		name, path, body string
		err              errors.Error
		want             int
		wantMessage      string
	}{
		{name: "map: not JSON", path: mapPath, body: `{`, want: http.StatusBadRequest},
		{name: "map: empty body", path: mapPath, body: ``, want: http.StatusBadRequest},
		{name: "map: wrong type", path: mapPath, body: `{"email":5}`, want: http.StatusBadRequest},
		{name: "map: too large", path: mapPath, body: `{"name":"` + strings.Repeat("a", maxOnboardingBody) + `"}`, want: http.StatusBadRequest},
		{name: "map: invalid field", path: mapPath, body: `{}`, err: errors.BadInput.New("name is required"), want: http.StatusBadRequest, wantMessage: "name is required"},
		{name: "map: unknown project", path: mapPath, body: `{}`, err: errors.NotFound.New("project not found"), want: http.StatusNotFound},
		{name: "invite: not JSON", path: invitePath, body: `nope`, want: http.StatusBadRequest},
		{name: "invite: no access", path: invitePath, body: `{}`, err: errors.NotFound.New("the user has no access to this project"), want: http.StatusNotFound},
		{name: "invite: mail off", path: invitePath, body: `{}`, err: errors.Conflict.New("mail is disabled"), want: http.StatusConflict},
		{name: "invite: database failure", path: invitePath, body: `{}`, err: errors.Default.New("look up the user"), want: http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := newOnboardingRouter(t, &fakeAccess{err: tc.err}, &fakeInvites{err: tc.err}, apiKeyCaller)

			resp := post(r, tc.path, tc.body)

			if resp.Code != tc.want {
				t.Errorf("status = %d %s, want %d", resp.Code, resp.Body.String(), tc.want)
			}
			if tc.wantMessage != "" && !strings.Contains(resp.Body.String(), tc.wantMessage) {
				t.Errorf("body = %s, want it to say %q", resp.Body.String(), tc.wantMessage)
			}
		})
	}
}
