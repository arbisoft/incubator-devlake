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

package services

import (
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/server/api/integration/repositories"
	mailsvc "github.com/apache/incubator-devlake/server/services/mail"
)

// fakeOnboarding implements accessStore and inviteStore with canned answers and records what it was given.
type fakeOnboarding struct {
	storedProject string // the stored name ProjectName returns; empty means no project
	mapping       repositories.UserMapping
	hasAccess     bool
	userName      string // empty means no users row
	compliance    repositories.Compliance
	failOn        string // the method that returns an error

	mapped     []string // email, name, project given to MapUser
	accessArgs []string // email, project given to HasAccess
}

var errStore = errors.Default.New("store failed")

func (f *fakeOnboarding) fail(method string) errors.Error {
	if f.failOn == method {
		return errStore
	}
	return nil
}

func (f *fakeOnboarding) ProjectName(string) (string, bool, errors.Error) {
	return f.storedProject, f.storedProject != "", f.fail("ProjectName")
}

func (f *fakeOnboarding) MapUser(email, name, projectName string) (repositories.UserMapping, errors.Error) {
	f.mapped = []string{email, name, projectName}
	return f.mapping, f.fail("MapUser")
}

func (f *fakeOnboarding) HasAccess(email, projectName string) (bool, errors.Error) {
	f.accessArgs = []string{email, projectName}
	return f.hasAccess, f.fail("HasAccess")
}

func (f *fakeOnboarding) UserName(string) (string, bool, errors.Error) {
	return f.userName, f.userName != "", f.fail("UserName")
}

func (f *fakeOnboarding) Compliance(string) (*repositories.Compliance, errors.Error) {
	if err := f.fail("Compliance"); err != nil {
		return nil, err
	}
	c := f.compliance
	return &c, nil
}

// fakeMailer records the request and returns err or a queued result.
type fakeMailer struct {
	req *mailsvc.SendRequest
	err errors.Error
}

func (f *fakeMailer) Send(req mailsvc.SendRequest) (*mailsvc.SendResult, errors.Error) {
	f.req = &req
	if f.err != nil {
		return nil, f.err
	}
	return &mailsvc.SendResult{ID: 7, Status: "QUEUED", Recipients: 1}, nil
}

// wantStatus checks that err carries the HTTP status want and, when it is set, mentions field.
func wantStatus(t *testing.T, err errors.Error, want int, field string) {
	t.Helper()
	if err == nil {
		t.Fatalf("error = nil, want status %d", want)
	}
	if got := err.GetType().GetHttpCode(); got != want {
		t.Errorf("status = %d, want %d (error %v)", got, want, err)
	}
	if field != "" && !strings.Contains(err.Error(), field) {
		t.Errorf("error = %q, want it to name %q", err.Error(), field)
	}
}

func TestProjectAccessMap(t *testing.T) {
	long := strings.Repeat("a", 256)
	cases := []struct {
		name                 string
		project, email, user string
		store                fakeOnboarding
		wantStatus           int
		wantField            string
	}{
		{name: "maps with the stored project name and a lowercase email", project: " payments ", email: " Lead@Arbisoft.COM ", user: "  Ali Khan ",
			store: fakeOnboarding{storedProject: "Payments", mapping: repositories.UserMapping{UserCreated: true, AccessCreated: true}}},
		{name: "any domain", project: "Payments", email: "lead@client.example", user: "Ali", store: fakeOnboarding{storedProject: "Payments"}},
		{name: "project missing", email: "a@b.com", user: "Ali", wantStatus: http.StatusBadRequest, wantField: "projectName"},
		{name: "project too long", project: long, email: "a@b.com", user: "Ali", wantStatus: http.StatusBadRequest, wantField: "projectName"},
		{name: "email invalid", project: "P", email: "Ali <a@b.com>", user: "Ali", wantStatus: http.StatusBadRequest, wantField: "email"},
		{name: "email too long for the column", project: "P", email: strings.Repeat("a", 250) + "@b.com", user: "Ali", wantStatus: http.StatusBadRequest, wantField: "email"},
		{name: "name missing", project: "P", email: "a@b.com", user: "  ", wantStatus: http.StatusBadRequest, wantField: "name"},
		{name: "name too long", project: "P", email: "a@b.com", user: long, wantStatus: http.StatusBadRequest, wantField: "name"},
		{name: "unknown project", project: "Nope", email: "a@b.com", user: "Ali", wantStatus: http.StatusNotFound, wantField: "project"},
		{name: "store error", project: "P", email: "a@b.com", user: "Ali", store: fakeOnboarding{storedProject: "P", failOn: "MapUser"}, wantStatus: http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := tc.store
			svc, err := NewProjectAccess(&store)
			if err != nil {
				t.Fatalf("NewProjectAccess() error = %v", err)
			}

			got, err := svc.Map(tc.project, tc.email, tc.user)

			if tc.wantStatus != 0 {
				wantStatus(t, err, tc.wantStatus, tc.wantField)
				return
			}
			if err != nil {
				t.Fatalf("Map() error = %v", err)
			}
			email := strings.ToLower(strings.TrimSpace(tc.email))
			if want := []string{email, strings.TrimSpace(tc.user), store.storedProject}; !reflect.DeepEqual(store.mapped, want) {
				t.Errorf("MapUser got %q, want %q", store.mapped, want)
			}
			want := &ProjectUserMapping{ProjectName: store.storedProject, Email: email,
				UserCreated: store.mapping.UserCreated, NameUpdated: store.mapping.NameUpdated, AccessCreated: store.mapping.AccessCreated}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("Map() = %+v, want %+v", got, want)
			}
		})
	}
}

func TestInviteSenderSend(t *testing.T) {
	ready := fakeOnboarding{storedProject: "Payments", hasAccess: true, userName: "Ali Khan",
		compliance: repositories.Compliance{PR: repositories.Visibility{Visible: true, Sources: "GitHub"}, Score: "33.3%"}}
	with := func(change func(*fakeOnboarding)) fakeOnboarding {
		f := ready
		change(&f)
		return f
	}
	cases := []struct {
		name       string
		email      string
		store      fakeOnboarding
		mailErr    errors.Error
		wantStatus int
		wantField  string
	}{
		{name: "queues the invite", email: " Lead@Arbisoft.com", store: ready},
		{name: "email invalid", email: "not-an-email", store: ready, wantStatus: http.StatusBadRequest, wantField: "email"},
		{name: "unknown project", email: "lead@arbisoft.com", store: with(func(f *fakeOnboarding) { f.storedProject = "" }), wantStatus: http.StatusNotFound, wantField: "project"},
		{name: "no access", email: "lead@arbisoft.com", store: with(func(f *fakeOnboarding) { f.hasAccess = false }), wantStatus: http.StatusNotFound, wantField: "access"},
		{name: "no users row", email: "lead@arbisoft.com", store: with(func(f *fakeOnboarding) { f.userName = "" }), wantStatus: http.StatusNotFound, wantField: "user not found"},
		{name: "scorecard error", email: "lead@arbisoft.com", store: with(func(f *fakeOnboarding) { f.failOn = "Compliance" }), wantStatus: http.StatusInternalServerError},
		{name: "mail off", email: "lead@arbisoft.com", store: ready, mailErr: errors.Conflict.New("mail is disabled"), wantStatus: http.StatusConflict},
		{name: "domain not allowed", email: "lead@client.example", store: ready, mailErr: errors.BadInput.New("no valid recipients"), wantStatus: http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store, mailer := tc.store, &fakeMailer{err: tc.mailErr}
			svc, err := NewInviteSender(&store, mailer, "https://devlake.example.com")
			if err != nil {
				t.Fatalf("NewInviteSender() error = %v", err)
			}

			got, err := svc.Send("payments", tc.email, "Integration Bot")

			if tc.wantStatus != 0 {
				wantStatus(t, err, tc.wantStatus, tc.wantField)
				return
			}
			if err != nil {
				t.Fatalf("Send() error = %v", err)
			}
			if want := (&InviteEmail{ID: 7, Status: "QUEUED"}); !reflect.DeepEqual(got, want) {
				t.Errorf("Send() = %+v, want %+v", got, want)
			}
			if want := []string{"lead@arbisoft.com", "Payments"}; !reflect.DeepEqual(store.accessArgs, want) {
				t.Errorf("HasAccess got %q, want %q", store.accessArgs, want)
			}
			req := mailer.req
			if req.Template != mailsvc.TemplateProjectInvite || req.ProjectName != "Payments" || req.Source != inviteSource ||
				req.SourceID != "lead@arbisoft.com" || req.SentBy != "Integration Bot" ||
				!reflect.DeepEqual(req.Recipients, []string{"lead@arbisoft.com"}) {
				t.Errorf("SendRequest = %+v", req)
			}
			data, ok := req.Data.(mailsvc.ProjectInviteData)
			if !ok || data.Name != "Ali Khan" || data.Score != "33.3%" || data.Link != "https://devlake.example.com/projects/Payments" {
				t.Errorf("Data = %+v", req.Data)
			}
		})
	}
}

func TestInviteData(t *testing.T) {
	visible := repositories.Visibility{Visible: true, Sources: "Jira"}
	cases := []struct {
		name      string
		c         repositories.Compliance
		base      string
		project   string
		wantScore string
		wantDone  []bool
		wantLink  string
	}{
		{name: "nothing set up, no link", c: repositories.Compliance{Score: "00.0%"}, wantScore: "00.0%", wantDone: []bool{false, false, false}, project: "P"},
		{name: "two set up", c: repositories.Compliance{Issue: visible, AI: visible, Score: "66.6%"}, wantScore: "66.6%", wantDone: []bool{true, false, true},
			base: "https://d.example.com", project: "P", wantLink: "https://d.example.com/projects/P"},
		{name: "all set up, name escaped in the link", c: repositories.Compliance{Issue: visible, PR: visible, AI: visible, Score: "100%"}, wantScore: "100%",
			wantDone: []bool{true, true, true}, base: "https://d.example.com/lake", project: "Team A/B?",
			wantLink: "https://d.example.com/lake/projects/Team%20A%2FB%3F"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := inviteData("Ali", tc.project, tc.c, tc.base)

			if got.Score != tc.wantScore || got.Link != tc.wantLink || got.Title != inviteTitle || got.Name != "Ali" {
				t.Errorf("inviteData() = %+v, want score %q and link %q", got, tc.wantScore, tc.wantLink)
			}
			done := make([]bool, 0, len(got.Checks))
			for _, c := range got.Checks {
				done = append(done, c.Done)
				if c.Done && c.Sources == "" || !c.Done && c.Hint == "" {
					t.Errorf("check %+v must have sources when done and a hint otherwise", c)
				}
			}
			if !reflect.DeepEqual(done, tc.wantDone) {
				t.Errorf("checks done = %v, want %v", done, tc.wantDone)
			}
		})
	}
}

func TestOnboardingConstructorsRejectNil(t *testing.T) {
	if _, err := NewProjectAccess(nil); err == nil {
		t.Error("NewProjectAccess(nil) error = nil, want an error")
	}
	if _, err := NewInviteSender(nil, &fakeMailer{}, ""); err == nil {
		t.Error("NewInviteSender(nil store) error = nil, want an error")
	}
	if _, err := NewInviteSender(&fakeOnboarding{}, nil, ""); err == nil {
		t.Error("NewInviteSender(nil mailer) error = nil, want an error")
	}
}
