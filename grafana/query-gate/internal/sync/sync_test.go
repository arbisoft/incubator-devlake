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

package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/grafana/query-gate/internal/templates"
)

type dash struct {
	generation  int
	annotations map[string]string
	spec        string
}

const listPageSize = 2

type fakeGrafana struct {
	mu        sync.Mutex
	calls     int
	fail      bool
	users     []map[string]any
	orgUsers  []map[string]any
	dashboard map[string]dash
	auth      string
	listCalls int
}

func (f *fakeGrafana) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	u, p, _ := r.BasicAuth()
	f.auth = u + ":" + p
	if f.fail {
		http.Error(w, "down", http.StatusInternalServerError)
		return
	}
	page := func(all []map[string]any) []map[string]any {
		per, _ := strconv.Atoi(r.URL.Query().Get("perpage"))
		pg, _ := strconv.Atoi(r.URL.Query().Get("page"))
		lo, hi := (pg-1)*per, pg*per
		if lo > len(all) {
			lo = len(all)
		}
		if hi > len(all) {
			hi = len(all)
		}
		return all[lo:hi]
	}
	switch r.URL.Path {
	case "/api/users/search":
		_ = json.NewEncoder(w).Encode(map[string]any{"totalCount": len(f.users), "users": page(f.users)})
	case "/api/org/users/search":
		_ = json.NewEncoder(w).Encode(map[string]any{"totalCount": len(f.orgUsers), "orgUsers": page(f.orgUsers)})
	case "/apis/dashboard.grafana.app/v1beta1/namespaces/default/dashboards":
		f.listCalls++
		var uids []string
		for uid := range f.dashboard {
			uids = append(uids, uid)
		}
		sort.Strings(uids)
		start := 0
		if tok := r.URL.Query().Get("continue"); tok != "" {
			n, err := strconv.Atoi(strings.TrimPrefix(tok, "page 2+/"))
			if err != nil || !strings.HasPrefix(tok, "page 2+/") {
				http.Error(w, "bad continue token", http.StatusBadRequest)
				return
			}
			start = n
		}
		end := min(start+listPageSize, len(uids))
		items := []map[string]any{}
		for _, uid := range uids[start:end] {
			d := f.dashboard[uid]
			meta := map[string]any{"name": uid, "generation": d.generation}
			if d.annotations != nil {
				meta["annotations"] = d.annotations
			}
			items = append(items, map[string]any{"metadata": meta, "spec": json.RawMessage(d.spec)})
		}
		next := ""
		if end < len(uids) {
			next = "page 2+/" + strconv.Itoa(end)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"kind": "DashboardList", "metadata": map[string]any{"continue": next}, "items": items})
	default:
		http.NotFound(w, r)
	}
}

func (f *fakeGrafana) callCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

func (f *fakeGrafana) edit(fn func()) {
	f.mu.Lock()
	defer f.mu.Unlock()
	fn()
}

func dashJSON(title, sql string, tags ...string) string {
	t, _ := json.Marshal(tags)
	q, _ := json.Marshal(sql)
	return fmt.Sprintf(`{"title":%q,"tags":%s,"panels":[{"title":"P","targets":[{"refId":"A","rawSql":%s}]}]}`, title, t, q)
}

func by(updatedBy string) map[string]string {
	return map[string]string{"grafana.app/updatedBy": updatedBy}
}

func newFake() *fakeGrafana {
	return &fakeGrafana{
		users: []map[string]any{
			{"login": "root", "uid": "u-root", "isAdmin": true},
			{"login": "ed", "uid": "u-ed", "isAdmin": false},
		},
		orgUsers: []map[string]any{
			{"login": "orgadmin", "uid": "u-orgadmin", "role": "Admin"},
			{"login": "ed", "uid": "u-ed", "role": "Editor"},
		},
		dashboard: map[string]dash{},
	}
}

func newSyncer(t *testing.T, f *fakeGrafana, user string, shipped []*templates.Template) *Syncer {
	t.Helper()
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	u, err := url.Parse(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	return New(u, "", user, "pw", time.Minute, shipped, slog.New(slog.DiscardHandler))
}

const own = "SELECT a FROM t WHERE owner = ${__user.login:sqlstring}"

func TestSyncTrustsAdminSavedDashboards(t *testing.T) {
	f := newFake()
	f.dashboard = map[string]dash{
		"org":      {1, by("user:u-orgadmin"), dashJSON("Org", "SELECT org")},
		"server":   {1, by("user:u-root"), dashJSON("Server", "SELECT server")},
		"editor":   {1, by("user:u-ed"), dashJSON("Editor", "SELECT editor")},
		"precede":  {1, map[string]string{"grafana.app/updatedBy": "user:u-ed", "grafana.app/createdBy": "user:u-root"}, dashJSON("Precede", "SELECT precede")},
		"creator":  {1, map[string]string{"grafana.app/createdBy": "user:u-root"}, dashJSON("Creator", "SELECT creator")},
		"svc":      {1, by("service-account:u-root"), dashJSON("Svc", "SELECT svc")},
		"anon":     {1, by("Anonymous"), dashJSON("Anon", "SELECT anon")},
		"none":     {1, nil, dashJSON("None", "SELECT none")},
		"unknown":  {1, by("user:u-ghost"), dashJSON("Ghost", "SELECT ghost")},
		"loginish": {1, by("user:root"), dashJSON("Login", "SELECT loginish")},
	}
	s := newSyncer(t, f, "svc", nil)
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	set := s.Current()
	for _, sql := range []string{"SELECT org", "SELECT server", "SELECT creator"} {
		if m := set.Match(sql, templates.Caller{Login: "x"}); m.Reason != templates.ReasonNoLoginSlot {
			t.Errorf("%s: %+v", sql, m)
		}
	}
	for _, sql := range []string{"SELECT editor", "SELECT precede", "SELECT svc", "SELECT anon", "SELECT none", "SELECT ghost", "SELECT loginish"} {
		if m := set.Match(sql, templates.Caller{Login: "x"}); m.Reason != templates.ReasonNoMatch {
			t.Errorf("%s should be untrusted: %+v", sql, m)
		}
	}
	if set.Len() != 3 {
		t.Fatalf("Len = %d", set.Len())
	}
	if f.auth != "svc:pw" {
		t.Fatalf("basic auth = %q", f.auth)
	}
	if f.listCalls != 5 {
		t.Fatalf("list calls = %d, want 5 pages", f.listCalls)
	}
}

func TestSyncAcceptsLoginAndAllProjectsTemplates(t *testing.T) {
	f := newFake()
	f.dashboard = map[string]dash{
		"mine": {1, by("user:u-root"), dashJSON("Mine", own)},
		"all":  {1, by("user:u-root"), dashJSON("All", "SELECT everyone", "devlake:all-projects")},
		"nope": {1, by("user:u-root"), dashJSON("Nope", "SELECT untagged")},
	}
	s := newSyncer(t, f, "svc", nil)
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	set := s.Current()
	if m := set.Match("SELECT everyone", templates.Caller{Login: "viewer"}); !m.Accepted {
		t.Fatalf("tagged: %+v", m)
	}
	if m := set.Match("SELECT untagged", templates.Caller{Login: "viewer"}); m.Accepted {
		t.Fatalf("untagged accepted: %+v", m)
	}
	if m := set.Match("SELECT a FROM t WHERE owner = 'viewer'", templates.Caller{Login: "viewer"}); !m.Accepted {
		t.Fatalf("login template: %+v", m)
	}
	if m := set.Match("SELECT a FROM t WHERE owner = 'viewer'", templates.Caller{Login: "other"}); m.Accepted {
		t.Fatalf("login swap accepted: %+v", m)
	}
}

func TestSyncIncludesShippedTemplates(t *testing.T) {
	shipped, errs := templates.LoadDashboard([]byte(dashJSON("Shipped", "SELECT shipped", "devlake:all-projects")), "file")
	if len(errs) != 0 {
		t.Fatal(errs)
	}
	f := newFake()
	s := newSyncer(t, f, "svc", shipped)
	if !s.Current().Match("SELECT shipped", templates.Caller{Login: "v"}).Accepted {
		t.Fatal("shipped set missing before the first sync")
	}
	f.dashboard["a"] = dash{1, by("user:u-root"), dashJSON("A", "SELECT a", "devlake:all-projects")}
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !s.Current().Match("SELECT shipped", templates.Caller{Login: "v"}).Accepted || !s.Current().Match("SELECT a", templates.Caller{Login: "v"}).Accepted {
		t.Fatal("union missing a part")
	}
}

func TestSyncSkipsCompileErrors(t *testing.T) {
	f := newFake()
	f.dashboard["d"] = dash{1, by("user:u-root"), `{"title":"D","tags":["devlake:all-projects"],"panels":[{"title":"P","targets":[{"refId":"A","rawSql":"SELECT $__interval"},{"refId":"B","rawSql":"SELECT ok"}]}]}`}
	f.dashboard["bad"] = dash{1, by("user:u-root"), `{"title":"Bad","panels":"x"}`}
	s := newSyncer(t, f, "svc", nil)
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !s.Current().Match("SELECT ok", templates.Caller{Login: "v"}).Accepted || s.Current().Len() != 1 {
		t.Fatalf("Len = %d", s.Current().Len())
	}
}

func TestSyncFailureKeepsLastGoodSet(t *testing.T) {
	f := newFake()
	f.dashboard["a"] = dash{1, by("user:u-root"), dashJSON("A", "SELECT a", "devlake:all-projects")}
	s := newSyncer(t, f, "svc", nil)
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	f.edit(func() { f.fail = true })
	if err := s.RunOnce(context.Background()); err == nil {
		t.Fatal("expected an error")
	}
	if !s.Current().Match("SELECT a", templates.Caller{Login: "v"}).Accepted {
		t.Fatal("last good set lost")
	}
	f.edit(func() {
		f.fail = false
		f.dashboard["b"] = dash{1, by("user:u-root"), dashJSON("B", "SELECT b", "devlake:all-projects")}
	})
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !s.Current().Match("SELECT b", templates.Caller{Login: "v"}).Accepted {
		t.Fatal("did not recover")
	}
}

func TestSyncDropsDashboardResavedByEditor(t *testing.T) {
	f := newFake()
	f.dashboard["a"] = dash{1, by("user:u-root"), dashJSON("A", "SELECT a", "devlake:all-projects")}
	s := newSyncer(t, f, "svc", nil)
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	f.edit(func() {
		f.dashboard["a"] = dash{2, by("user:u-ed"), dashJSON("A", "SELECT evil", "devlake:all-projects")}
	})
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if s.Current().Match("SELECT evil", templates.Caller{Login: "v"}).Accepted || s.Current().Match("SELECT a", templates.Caller{Login: "v"}).Accepted {
		t.Fatal("dashboard last saved by an editor must drop out of the set")
	}
}

func TestSyncRecompilesOnlyOnChange(t *testing.T) {
	f := newFake()
	f.dashboard["a"] = dash{1, by("user:u-root"), dashJSON("A", "SELECT a", "devlake:all-projects")}
	f.dashboard["e"] = dash{1, by("user:u-ed"), dashJSON("E", "SELECT e", "devlake:all-projects")}
	s := newSyncer(t, f, "svc", nil)
	for i := 0; i < 3; i++ {
		if err := s.RunOnce(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	if s.compiles != 1 {
		t.Fatalf("compiles = %d, want 1 (untrusted dashboards are never compiled)", s.compiles)
	}
	f.edit(func() {
		f.dashboard["a"] = dash{2, by("user:u-root"), dashJSON("A", "SELECT a2", "devlake:all-projects")}
	})
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if s.compiles != 2 || !s.Current().Match("SELECT a2", templates.Caller{Login: "v"}).Accepted || s.Current().Match("SELECT a", templates.Caller{Login: "v"}).Accepted {
		t.Fatalf("compiles = %d", s.compiles)
	}
	f.edit(func() {
		f.dashboard["a"] = dash{2, by("user:u-root"), dashJSON("A", "SELECT a2", "devlake:all-projects")}
	})
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if s.compiles != 2 {
		t.Fatalf("recompiled without a change: %d", s.compiles)
	}
	f.edit(func() { delete(f.dashboard, "a") })
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.cache["a"]; ok || s.Current().Len() != 0 {
		t.Fatal("removed dashboard still cached or trusted")
	}
}

func TestSyncPaginatesUsers(t *testing.T) {
	oldPage := pageSize
	pageSize = 2
	t.Cleanup(func() { pageSize = oldPage })
	f := newFake()
	f.users = nil
	f.orgUsers = nil
	for i := 0; i < 5; i++ {
		f.users = append(f.users, map[string]any{"login": fmt.Sprintf("u%d", i), "uid": fmt.Sprintf("uu%d", i), "isAdmin": i == 4})
		f.orgUsers = append(f.orgUsers, map[string]any{"login": fmt.Sprintf("o%d", i), "uid": fmt.Sprintf("ou%d", i), "role": map[bool]string{true: "Admin", false: "Viewer"}[i == 4]})
	}
	for i, saver := range []string{"user:nobody", "user:uu4", "user:ou4", "user:uu0", "user:ou0"} {
		f.dashboard[fmt.Sprintf("d%d", i)] = dash{1, by(saver), dashJSON(fmt.Sprintf("D%d", i), fmt.Sprintf("SELECT %d", i), "devlake:all-projects")}
	}
	s := newSyncer(t, f, "svc", nil)
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	set := s.Current()
	if set.Len() != 2 || !set.Match("SELECT 1", templates.Caller{Login: "v"}).Accepted || !set.Match("SELECT 2", templates.Caller{Login: "v"}).Accepted {
		t.Fatalf("Len = %d", set.Len())
	}
}

func TestDisabledSyncerNeverCallsGrafana(t *testing.T) {
	f := newFake()
	s := newSyncer(t, f, "", nil)
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() { s.Run(context.Background()); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not return for a disabled syncer")
	}
	if f.callCount() != 0 || s.Current().Len() != 0 {
		t.Fatalf("calls = %d", f.callCount())
	}
}

func TestRunStopsWithContext(t *testing.T) {
	f := newFake()
	s := newSyncer(t, f, "svc", nil)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { s.Run(ctx); close(done) }()
	deadline := time.Now().Add(5 * time.Second)
	for f.callCount() == 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not stop")
	}
	if f.callCount() == 0 {
		t.Fatal("Run never synced")
	}
}
