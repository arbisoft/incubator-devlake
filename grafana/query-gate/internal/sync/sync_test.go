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
	"bytes"
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

type v2Dash struct {
	spec string
	// generation overrides the list generation to simulate a change between the two reads.
	generation int
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
	// failUsers makes that many user searches answer 500 before they succeed.
	failUsers int
	// conversionFailed marks list items whose v1 conversion failed; the list then serves an empty spec.
	conversionFailed map[string]bool
	// storedVersion marks list items with a stored version in their conversion status.
	storedVersion map[string]string
	// v2 is served by the v2 dashboard endpoint; a uid without an entry answers 404.
	v2 map[string]v2Dash
	// v2Status overrides the v2 endpoint's answer when non-zero.
	v2Status int
	v2Calls  []string
	// appSubURL is served by /api/frontend/settings; nil leaves the endpoint missing.
	appSubURL *string
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
	case "/api/frontend/settings":
		if f.appSubURL == nil {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"appSubUrl": *f.appSubURL})
	case "/api/users/search":
		if f.failUsers > 0 {
			f.failUsers--
			http.Error(w, "down", http.StatusInternalServerError)
			return
		}
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
			item := map[string]any{"metadata": meta, "spec": json.RawMessage(d.spec)}
			if f.conversionFailed[uid] {
				item["spec"] = json.RawMessage(`{}`)
				item["status"] = map[string]any{"conversion": map[string]any{"failed": true}}
			}
			if sv, ok := f.storedVersion[uid]; ok {
				item["status"] = map[string]any{"conversion": map[string]any{"failed": f.conversionFailed[uid], "storedVersion": sv}}
			}
			items = append(items, item)
		}
		next := ""
		if end < len(uids) {
			next = "page 2+/" + strconv.Itoa(end)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"kind": "DashboardList", "metadata": map[string]any{"continue": next}, "items": items})
	default:
		const v2Prefix = "/apis/dashboard.grafana.app/v2/namespaces/default/dashboards/"
		uid, isV2 := strings.CutPrefix(r.URL.Path, v2Prefix)
		d, known := f.v2[uid]
		if !isV2 {
			http.NotFound(w, r)
			return
		}
		f.v2Calls = append(f.v2Calls, uid)
		if f.v2Status != 0 {
			http.Error(w, "down", f.v2Status)
			return
		}
		if !known {
			http.NotFound(w, r)
			return
		}
		base := f.dashboard[uid]
		gen := base.generation
		if d.generation != 0 {
			gen = d.generation
		}
		meta := map[string]any{"name": uid, "generation": gen, "annotations": base.annotations}
		_ = json.NewEncoder(w).Encode(map[string]any{"metadata": meta, "spec": json.RawMessage(d.spec)})
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

func TestSaverFallsBackToCreatorOnlyOnFirstGeneration(t *testing.T) {
	tests := []struct {
		name string
		d    dash
		want int
	}{
		{"first generation uses creator", dash{1, map[string]string{"grafana.app/createdBy": "user:u-root"}, dashJSON("A", "SELECT a")}, 1},
		{"later generation ignores creator", dash{3, map[string]string{"grafana.app/createdBy": "user:u-root"}, dashJSON("A", "SELECT a")}, 0},
		{"later generation uses updater", dash{3, map[string]string{"grafana.app/updatedBy": "user:u-root"}, dashJSON("A", "SELECT a")}, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newFake()
			f.dashboard["a"] = tt.d
			s := newSyncer(t, f, "svc", nil)
			if err := s.RunOnce(context.Background()); err != nil {
				t.Fatal(err)
			}
			if got := s.Current().Len(); got != tt.want {
				t.Fatalf("Len = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestSyncLogsNewlyTrustedGeneration(t *testing.T) {
	f := newFake()
	f.dashboard["a"] = dash{1, by("user:u-root"), dashJSON("A", "SELECT a")}
	s := newSyncer(t, f, "svc", nil)
	var buf bytes.Buffer
	s.logger = slog.New(slog.NewJSONHandler(&buf, nil))
	for i := 0; i < 2; i++ {
		if err := s.RunOnce(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	if n := strings.Count(buf.String(), `"msg":"dashboard trusted"`); n != 1 {
		t.Fatalf("trusted lines = %d, want 1:\n%s", n, buf.String())
	}
	f.edit(func() { f.dashboard["a"] = dash{2, by("user:u-root"), dashJSON("A", "SELECT a2")} })
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if n := strings.Count(buf.String(), `"msg":"dashboard trusted"`); n != 2 {
		t.Fatalf("trusted lines = %d, want 2:\n%s", n, buf.String())
	}
}

func TestRunRetriesUntilFirstSuccess(t *testing.T) {
	f := newFake()
	f.failUsers = 2
	s := newSyncer(t, f, "svc", nil)
	var mu sync.Mutex
	var waits []time.Duration
	s.after = func(d time.Duration) <-chan time.Time {
		mu.Lock()
		waits = append(waits, d)
		mu.Unlock()
		ch := make(chan time.Time, 1)
		ch <- time.Time{}
		return ch
	}
	s.jitter = func(d time.Duration) time.Duration { return d }
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { s.Run(ctx); close(done) }()
	deadline := time.Now().Add(5 * time.Second)
	for s.Status().LastSuccess == nil && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	cancel()
	<-done
	st := s.Status()
	mu.Lock()
	defer mu.Unlock()
	if len(waits) != 2 || waits[0] != 2*time.Second || waits[1] != 4*time.Second {
		t.Fatalf("backoffs = %v, want [2s 4s]", waits)
	}
	if st.LastSuccess == nil || st.LastErrorAt == nil || st.ConsecutiveFailures != 0 || !st.Enabled {
		t.Fatalf("status = %+v", st)
	}
}

func TestRootPathCheck(t *testing.T) {
	str := func(v string) *string { return &v }
	tests := []struct {
		name      string
		appSubURL *string
		want      *bool
	}{
		{"matching root", str(""), new(true)},
		{"mismatched root", str("/grafana"), new(false)},
		{"endpoint missing", nil, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newFake()
			f.appSubURL = tt.appSubURL
			s := newSyncer(t, f, "svc", nil)
			if err := s.RunOnce(context.Background()); err != nil {
				t.Fatal(err)
			}
			got := s.Status().RootPathOK
			if (got == nil) != (tt.want == nil) || (got != nil && *got != *tt.want) {
				t.Fatalf("RootPathOK = %v, want %v", got, tt.want)
			}
		})
	}
}

func v2Spec(title, sql string) string {
	q, _ := json.Marshal(sql)
	return fmt.Sprintf(`{"title":%q,"elements":{"panel-1":{"kind":"Panel","spec":{"title":"P","data":{"kind":"QueryGroup","spec":{"queries":[{"kind":"PanelQuery","spec":{"refId":"A","query":{"kind":"DataQuery","spec":{"rawSql":%s}}}}]}}}}}}`, title, q)
}

func v2TabSpec(title, sql string) string {
	q, _ := json.Marshal(sql)
	return fmt.Sprintf(`{"title":%q,"elements":{"panel-1":{"kind":"Panel","spec":{"title":"P","data":{"kind":"QueryGroup","spec":{"queries":[{"kind":"PanelQuery","spec":{"refId":"A","query":{"kind":"DataQuery","spec":{"rawSql":%s}}}}]}}}}},`+
		`"layout":{"kind":"TabsLayout","spec":{"tabs":[{"kind":"TabsLayoutTab","spec":{"title":"T","variables":[{"kind":"CustomVariable","spec":{"name":"grp","query":"a,b"}}],`+
		`"layout":{"kind":"GridLayout","spec":{"items":[{"kind":"GridLayoutItem","spec":{"element":{"kind":"ElementReference","name":"panel-1"}}}]}}}}]}}}`, title, q)
}

func TestSyncStoredV2FetchesV2Spec(t *testing.T) {
	caller := templates.Caller{Login: "alice"}
	tabSQL := "SELECT g FROM t WHERE o = ${__user.login:sqlstring} AND g = '$grp'"
	f := newFake()
	f.dashboard = map[string]dash{
		"tabbed":  {2, by("user:u-root"), dashJSON("Tabbed", tabSQL)},
		"classic": {1, by("user:u-root"), dashJSON("Classic", own)},
	}
	f.storedVersion = map[string]string{"tabbed": "v2", "classic": "v1beta1"}
	f.v2 = map[string]v2Dash{"tabbed": {spec: v2TabSpec("Tabbed", tabSQL)}}
	s := newSyncer(t, f, "svc", nil)
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	for sql, want := range map[string]bool{
		"SELECT g FROM t WHERE o = 'alice' AND g = 'a'":   true,
		"SELECT g FROM t WHERE o = 'alice' AND g = 'b'":   true,
		"SELECT g FROM t WHERE o = 'alice' AND g = 'zzz'": false,
		"SELECT a FROM t WHERE owner = 'alice'":           true,
	} {
		if got := s.Current().Match(sql, caller).Accepted; got != want {
			t.Errorf("%q accepted = %v, want %v", sql, got, want)
		}
	}
	if strings.Join(f.v2Calls, ",") != "tabbed" {
		t.Fatalf("v2 fetches = %v", f.v2Calls)
	}
}

func TestSyncLoadsV2SpecWhenConversionFailed(t *testing.T) {
	caller := templates.Caller{Login: "alice"}
	f := newFake()
	f.dashboard = map[string]dash{
		"admin":  {2, by("user:u-root"), `{}`},
		"editor": {2, by("user:u-ed"), `{}`},
	}
	f.conversionFailed = map[string]bool{"admin": true, "editor": true}
	f.v2 = map[string]v2Dash{
		"admin":  {spec: v2Spec("Admin", own)},
		"editor": {spec: v2Spec("Editor", "SELECT editor WHERE owner = ${__user.login:sqlstring}")},
	}
	s := newSyncer(t, f, "svc", nil)
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !s.Current().Match("SELECT a FROM t WHERE owner = 'alice'", caller).Accepted {
		t.Fatal("admin-saved v2 query not accepted")
	}
	if s.Current().Match("SELECT editor WHERE owner = 'alice'", caller).Accepted {
		t.Fatal("editor-saved v2 query accepted")
	}
	if s.Current().Len() != 1 || strings.Join(f.v2Calls, ",") != "admin" {
		t.Fatalf("Len = %d, v2 fetches = %v", s.Current().Len(), f.v2Calls)
	}
	if err := s.RunOnce(context.Background()); err != nil || len(f.v2Calls) != 1 {
		t.Fatalf("cached generation refetched: err = %v, fetches = %v", err, f.v2Calls)
	}
}

func TestSyncSkipsV2DashboardChangedDuringSync(t *testing.T) {
	caller := templates.Caller{Login: "alice"}
	f := newFake()
	f.dashboard = map[string]dash{"d": {2, by("user:u-root"), `{}`}}
	f.conversionFailed = map[string]bool{"d": true}
	f.v2 = map[string]v2Dash{"d": {spec: v2Spec("D", own), generation: 3}}
	s := newSyncer(t, f, "svc", nil)
	var buf bytes.Buffer
	s.logger = slog.New(slog.NewJSONHandler(&buf, nil))
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if s.Current().Match("SELECT a FROM t WHERE owner = 'alice'", caller).Accepted || s.cache["d"] != nil || s.compiles != 0 {
		t.Fatalf("changed dashboard trusted: cache = %v, compiles = %d", s.cache["d"], s.compiles)
	}
	if !strings.Contains(buf.String(), "dashboard skipped: changed during sync") || strings.Contains(buf.String(), "dashboard trusted") {
		t.Fatalf("log = %s", buf.String())
	}
	f.edit(func() { f.v2["d"] = v2Dash{spec: v2Spec("D", own)} })
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !s.Current().Match("SELECT a FROM t WHERE owner = 'alice'", caller).Accepted || s.compiles != 1 {
		t.Fatalf("next sync did not trust the dashboard: compiles = %d", s.compiles)
	}
}

func TestSyncV2FetchFailureSkipsOnlyThatDashboard(t *testing.T) {
	caller := templates.Caller{Login: "alice"}
	for name, status := range map[string]int{"missing": 0, "error": http.StatusInternalServerError} {
		t.Run(name, func(t *testing.T) {
			f := newFake()
			okJSON := dashJSON("Ok", "SELECT ok WHERE o = ${__user.login:sqlstring}")
			f.dashboard = map[string]dash{"ok": {1, by("user:u-root"), okJSON}}
			s := newSyncer(t, f, "svc", nil)
			if err := s.RunOnce(context.Background()); err != nil {
				t.Fatal(err)
			}
			if !s.Current().Match("SELECT ok WHERE o = 'alice'", caller).Accepted {
				t.Fatal("first sync did not accept the query")
			}
			f.edit(func() {
				f.dashboard["ok"] = dash{2, by("user:u-ed"), okJSON}
				f.dashboard["v2"] = dash{1, by("user:u-root"), `{}`}
				f.conversionFailed = map[string]bool{"v2": true}
				f.v2 = map[string]v2Dash{}
				f.v2Status = status
			})
			if err := s.RunOnce(context.Background()); err != nil {
				t.Fatal(err)
			}
			if s.Current().Match("SELECT ok WHERE o = 'alice'", caller).Accepted || s.Current().Len() != 0 || s.cache["v2"] != nil {
				t.Fatalf("revocation frozen: Len = %d, cache[v2] = %v", s.Current().Len(), s.cache["v2"])
			}
		})
	}
}
