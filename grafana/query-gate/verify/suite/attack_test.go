//go:build verify

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

package suite

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"testing"
)

func TestCanaryPositiveControl(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	eachEdge(t, func(t *testing.T, tg target) {
		for name, u := range map[string]user{"orgAdmin": us.orgAdmin, "serverAdmin": us.serverAdmin} {
			r := tg.dsQueryOpen(t, name, tg.cookie(t, u), queryBody(t, tg.topo, mysqlUID, canarySQL()))
			wantStatus(t, name, r, http.StatusOK)
			if !leaked(r.body) {
				t.Errorf("%s: canary missing from a 200 response, so the leak check cannot see a leak", name)
			}
		}
	})
}

func TestViewerSavedQueryAccepted(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	projA := needProjects(t, us.viewerA.login)
	eachEntry(t, func(t *testing.T, tg target) {
		cookie := tg.cookie(t, us.viewerA)
		for _, id := range []int{panelTasks, panelCover} {
			name := "panel-" + strconv.Itoa(id)
			r := tg.dsQuery(t, name, cookie, queryBody(t, tg.topo, mysqlUID, savedSQL(t, id, us.viewerA.login, projA)))
			wantStatus(t, name, r, http.StatusOK)
			if !hasFrames(r.body, "A") {
				t.Errorf("%s: no results.A.frames", name)
			}
			if id == panelCover {
				got := frameColumn(r.body, "A", "Project")
				if len(got) == 0 {
					t.Errorf("%s: zero rows; prerequisite: %s needs issues on a mapped project in the local lake DB", name, us.viewerA.login)
				}
				if !subset(got, projA) {
					t.Errorf("%s: Project values %v not within %v", name, got, projA)
				}
			}
		}
	})
}

func TestForgedProjectsStayScoped(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	projA, projB := needProjects(t, us.viewerA.login), needProjects(t, us.viewerB.login)
	eachEdge(t, func(t *testing.T, tg target) {
		forged := append(append(append([]string{}, projA...), projB...), "Supercal", "edly-Github")
		r := tg.dsQuery(t, "B-forged", tg.cookie(t, us.viewerB), queryBody(t, tg.topo, mysqlUID, savedSQL(t, panelCover, us.viewerB.login, forged)))
		wantStatus(t, "B-forged", r, http.StatusOK)
		if got := frameColumn(r.body, "A", "Project"); !subset(got, projB) {
			t.Errorf("B-forged: Project values %v not within B's projects %v", got, projB)
		}
		r = tg.dsQuery(t, "A-with-B-projects", tg.cookie(t, us.viewerA), queryBody(t, tg.topo, mysqlUID, savedSQL(t, panelCover, us.viewerA.login, projB)))
		wantStatus(t, "A-with-B-projects", r, http.StatusOK)
		if got := frameColumn(r.body, "A", "Project"); len(got) != 0 {
			t.Errorf("A-with-B-projects: expected zero rows, got %v", got)
		}
	})
}

func TestLoginSpoofRejected(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	projB := needProjects(t, us.viewerB.login)
	eachEntry(t, func(t *testing.T, tg target) {
		cookie := tg.cookie(t, us.viewerB)
		for _, login := range []string{us.viewerA.login, us.admin.login} {
			name := "B-as-" + login
			r := tg.dsQuery(t, name, cookie, queryBody(t, tg.topo, mysqlUID, savedSQL(t, panelCover, login, projB)))
			wantGate(t, name, r)
		}
	})
}

func TestSQLTamperingRejected(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	projA := needProjects(t, us.viewerA.login)
	login := us.viewerA.login
	base := savedSQL(t, panelTasks, login, projA)
	raw := savedPanel(t, savedFile, panelTasks)
	withProjects := func(ps ...string) string { return interpolate(raw, login, ps) }
	cases := []struct{ name, sql string }{
		{"union-newline", base + "\nUNION SELECT '" + canary + "'"},
		{"stacked", base + "; SELECT '" + canary + "'"},
		{"line-comment", base + " -- x"},
		{"versioned-comment", base + "/*!50000 UNION SELECT '" + canary + "' */"},
		{"backslash-project", withProjects(`a\`, `) UNION SELECT '`+canary+`' -- `)},
		{"lower-keyword", strings.Replace(base, "SELECT", "select", 1)},
		{"extra-space", strings.Replace(base, "SELECT", "SELECT ", 1)},
		{"login-subselect", interpolate(strings.ReplaceAll(raw, "${__user.login:sqlstring}", "(SELECT user_login FROM user_project_mapping LIMIT 1)"), login, projA)},
	}
	eachEntry(t, func(t *testing.T, tg target) {
		cookie := tg.cookie(t, us.viewerA)
		for _, c := range cases {
			t.Run(c.name, func(t *testing.T) {
				wantGate(t, c.name, tg.dsQuery(t, c.name, cookie, queryBody(t, tg.topo, mysqlUID, c.sql)))
			})
		}
	})
}

func TestOddQuotedValuesAreHarmless(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	raw := savedPanel(t, savedFile, panelCover)
	cases := map[string][]string{
		"quote-or-1-1":    {`x') OR 1=1 -- `},
		"newline-project": {"a\nb"},
	}
	eachEntry(t, func(t *testing.T, tg target) {
		cookie := tg.cookie(t, us.viewerA)
		for name, ps := range cases {
			body := queryBody(t, tg.topo, mysqlUID, interpolate(raw, us.viewerA.login, ps))
			r := tg.dsQuery(t, name, cookie, body)
			wantStatus(t, name, r, http.StatusOK)
			if got := answeredBy(r.body); got != "grafana" {
				t.Errorf("%s: answered by %s, want grafana", name, got)
			}
			if rows := frameColumn(r.body, "A", "Project"); len(rows) != 0 {
				t.Errorf("%s: expected zero rows, got %v", name, rows)
			}
		}
	})
}

type trick struct {
	name   string
	body   []byte
	ctype  string
	noCT   bool
	header map[string]string
	chunk  bool
	want   []int
	absent []string
	frames bool
}

func gzipped(t *testing.T, b []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := gzip.NewWriter(&buf)
	if _, err := w.Write(b); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func bodyTricks(t *testing.T, tg target, sqlA string) []trick {
	t.Helper()
	id := dsID(t, tg.topo, mysqlUID)
	ds := mysqlDS(mysqlUID)
	savedField, canaryField := rawSQLField(sqlA), rawSQLField(canarySQL())
	one := func(rest string) []byte { return wrapQueries(queryObj("A", ds, stdRest(rest, id))) }
	saved, canaryBody := one(savedField), one(canaryField)
	exprSQL := `{"refId":"B","datasource":{"type":"__expr__","uid":"__expr__"},"type":"sql","expression":` + jsonStr(canarySQL()) + `}`
	exprMath := `{"refId":"B","datasource":{"type":"__expr__","uid":"__expr__"},"type":"math","expression":"$A * 2"}`
	savedObj := queryObj("A", ds, stdRest(savedField, id))
	invalidUTF8 := one(`"rawSql":"SELECT '` + canary + "\xff" + `'"`)
	huge := one(savedField + `,"pad":"` + strings.Repeat("x", 17<<20) + `"`)
	bad, forbidden, either := []int{400}, []int{403}, []int{400, 403}
	return []trick{
		{name: "dup-saved-then-canary", body: one(savedField + "," + canaryField), want: []int{403, 400}},
		{name: "dup-canary-then-saved", body: one(canaryField + "," + savedField), want: []int{200, 400, 403}, frames: true},
		{name: "key-RAWSQL", body: one(`"RAWSQL":` + jsonStr(canarySQL()) + "," + savedField), want: bad},
		{name: "key-long-s", body: one(`"rawſql":` + jsonStr(canarySQL()) + "," + savedField), want: bad},
		{name: "canary-only", body: canaryBody, want: forbidden},
		{name: "two-objects", body: append(append([]byte{}, saved...), canaryBody...), want: bad},
		{name: "bom", body: append([]byte("\xef\xbb\xbf"), canaryBody...), want: []int{400, 403}},
		{name: "queries-object", body: []byte(`{"queries":` + savedObj + `,"from":"now-1h","to":"now"}`), want: bad},
		{name: "invalid-utf8", body: invalidUTF8, want: either},
		{name: "body-17MiB", body: huge, want: []int{413}},
		{name: "gzip", body: gzipped(t, canaryBody), header: map[string]string{"Content-Encoding": "gzip"}, want: []int{415}},
		{name: "chunked", body: canaryBody, chunk: true, want: forbidden},
		{name: "no-content-type", body: canaryBody, noCT: true, want: []int{415}},
		{name: "text-plain", body: canaryBody, ctype: "text/plain", want: []int{415}},
		{name: "form-urlencoded", body: canaryBody, ctype: "application/x-www-form-urlencoded", want: []int{415}},
		{name: "multipart", body: canaryBody, ctype: "multipart/form-data; boundary=x", want: []int{415}},
		{name: "json-charset", body: canaryBody, ctype: "application/json; charset=utf-8", want: forbidden},
		{name: "batch-saved-and-canary", body: wrapQueries(savedObj, queryObj("B", ds, stdRest(canaryField, id))), want: forbidden, absent: []string{"Tasks Done"}},
		{name: "expression-sql", body: wrapQueries(savedObj, exprSQL), want: forbidden},
		{name: "expression-math", body: wrapQueries(savedObj, exprMath), want: []int{200}},
	}
}

func TestBodyTricksRejected(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	sqlA := savedSQL(t, panelTasks, us.viewerA.login, needProjects(t, us.viewerA.login))
	eachEntry(t, func(t *testing.T, tg target) {
		cookie := tg.cookie(t, us.viewerA)
		for _, c := range bodyTricks(t, tg, sqlA) {
			t.Run(c.name, func(t *testing.T) {
				o := opts{cookie: cookie, body: c.body, headers: c.header, chunked: c.chunk, contentType: c.ctype}
				if o.contentType == "" && !c.noCT {
					o.contentType = jsonType
				}
				r := tg.call(t, c.name, http.MethodPost, tg.path("/api/ds/query"), o)
				wantStatus(t, c.name, r, c.want...)
				if c.frames && r.status == http.StatusOK && !hasFrames(r.body, "A") {
					t.Errorf("%s: 200 without results.A.frames", c.name)
				}
				for _, a := range c.absent {
					if strings.Contains(string(r.body), a) {
						t.Errorf("%s: response contains %q", c.name, a)
					}
				}
			})
		}
	})
}

func TestDatasourceVariantsRejected(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	projA := needProjects(t, us.viewerA.login)
	eachEntry(t, func(t *testing.T, tg target) {
		cookie := tg.cookie(t, us.viewerA)
		mysqlID := dsID(t, tg.topo, mysqlUID)
		type variant struct {
			name, ds string
			id       int64
			sql      string
			want     []int
		}
		vs := []variant{
			{"no-uid-mysql-id", `"datasource":{"type":"mysql"}`, mysqlID, canarySQL(), []int{403}},
			{"string-datasource", `"datasource":"mysql"`, mysqlID, canarySQL(), []int{400, 403}},
			{"unknown-uid", mysqlDS("does-not-exist"), mysqlID, canarySQL(), []int{403}},
		}
		if pid, puid, ok := prometheusDS(t, tg.topo); ok {
			vs = append(vs,
				variant{"prometheus-uid", `"datasource":{"type":"prometheus","uid":` + jsonStr(puid) + `}`, pid, canarySQL(), []int{403}},
				variant{"mysql-uid-prometheus-id", mysqlDS(mysqlUID), pid, canarySQL(), []int{403}})
		} else {
			t.Log("no prometheus datasource on this topology, skipping the two prometheus variants")
		}
		extraID := mysqlID
		if tg.topo.name == "prod" {
			extraID = dsID(t, tg.topo, prodExtraDS)
		}
		want := []int{403}
		if tg.topo.name == "prod" {
			want = []int{200}
		}
		vs = append(vs, variant{"saved-with-" + prodExtraDS, mysqlDS(prodExtraDS), extraID, savedSQL(t, panelTasks, us.viewerA.login, projA), want})
		for _, v := range vs {
			body := wrapQueries(queryObj("A", v.ds, stdRest(rawSQLField(v.sql), v.id)))
			wantStatus(t, v.name, tg.dsQuery(t, v.name, cookie, body), v.want...)
		}
	})
}

func prometheusDS(t *testing.T, tp topology) (int64, string, bool) {
	t.Helper()
	r := adminCall(t, tp, http.MethodGet, "/api/datasources", nil)
	var list []struct {
		ID   int64  `json:"id"`
		UID  string `json:"uid"`
		Type string `json:"type"`
	}
	if r.status != http.StatusOK || json.Unmarshal(r.body, &list) != nil {
		t.Fatalf("list datasources on %s: status %d", tp.name, r.status)
	}
	for _, d := range list {
		if d.Type == "prometheus" {
			return d.ID, d.UID, true
		}
	}
	return 0, "", false
}

func TestQueryPathVariants(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	projA := needProjects(t, us.viewerA.login)
	eachEntry(t, func(t *testing.T, tg target) {
		cookie := tg.cookie(t, us.viewerA)
		root := tg.topo.root
		paths := []string{
			root + "/api/ds/query/", root + "/api/ds/query?x=1", root + "/API/ds/query", root + "/api/DS/Query",
			root + "/api/ds//query", root + "//api/ds/query", root + "/api/./ds/query", root + "/api/x/../ds/query",
			root + "/api/ds/query%2F", root + "/api%2Fds%2Fquery", root + "/api/ds/query;x", root + "/api/ds/query%00",
			root + "/api/ds/%71uery",
		}
		if tg.topo.name == "staging" {
			paths = append(paths, "/GRAFANA/api/ds/query", "/grafana/grafana/api/ds/query", "/api/ds/query", "/grafana/../grafana/api/ds/query")
		}
		body := queryBody(t, tg.topo, mysqlUID, canarySQL())
		for _, p := range paths {
			r := tg.call(t, p, http.MethodPost, p, opts{cookie: cookie, contentType: jsonType, body: body, raw: true})
			t.Logf("wire: %s", r.wire)
			if r.wire != "POST "+p {
				t.Errorf("wire %q differs from intended path %q", r.wire, p)
			}
			if r.status >= 200 && r.status < 300 {
				t.Errorf("%s: status %d, want non-2xx", p, r.status)
			}
		}
		saved := queryBody(t, tg.topo, mysqlUID, savedSQL(t, panelTasks, us.viewerA.login, projA))
		r := tg.call(t, "saved-trailing-slash", http.MethodPost, root+"/api/ds/query/", opts{cookie: cookie, contentType: jsonType, body: saved, raw: true})
		wantStatus(t, "saved-trailing-slash", r, http.StatusOK)
	})
}

func TestQueryMethodVariants(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	eachEntry(t, func(t *testing.T, tg target) {
		cookie := tg.cookie(t, us.viewerA)
		body := queryBody(t, tg.topo, mysqlUID, canarySQL())
		cases := []struct {
			name, method string
			headers      map[string]string
		}{
			{"GET", http.MethodGet, nil}, {"PUT", http.MethodPut, nil}, {"PATCH", http.MethodPatch, nil},
			{"DELETE", http.MethodDelete, nil}, {"OPTIONS", http.MethodOptions, nil}, {"HEAD", http.MethodHead, nil},
			{"GET-override-POST", http.MethodGet, map[string]string{"X-HTTP-Method-Override": "POST"}},
		}
		for _, c := range cases {
			r := tg.call(t, c.name, c.method, tg.path("/api/ds/query"), opts{cookie: cookie, contentType: jsonType, body: body, headers: c.headers})
			twoXX := r.status >= 200 && r.status < 300
			emptyOK := c.method == http.MethodHead || c.method == http.MethodOptions
			if twoXX && !(emptyOK && len(r.body) == 0) {
				t.Errorf("%s: status %d with %d body bytes, want non-2xx", c.name, r.status, len(r.body))
			}
		}
	})
}

type adminPath struct {
	method, path string
	canary       bool
	body         string
}

func adminOnlyPaths() []adminPath {
	return []adminPath{
		{method: "GET", path: "/api/datasources/proxy/uid/devlake-mysql/"},
		{method: "GET", path: "/api/datasources/proxy/1/"},
		{method: "POST", path: "/api/datasources/uid/devlake-mysql/resources/query", canary: true},
		{method: "GET", path: "/api/datasources/1/resources"},
		{method: "GET", path: "/api/plugins/mysql/resources/x"},
		{method: "POST", path: "/apis/query.grafana.app/v0alpha1/namespaces/default/query", canary: true},
		{method: "POST", path: "/apis/mysql.datasource.grafana.app/v0alpha1/namespaces/default/datasources/devlake-mysql/query", canary: true},
		{method: "POST", path: "/api/v1/eval", canary: true},
		{method: "POST", path: "/api/snapshots", body: "{}"},
		{method: "POST", path: "/api/dashboards/uid/ai_throughput_overview/public-dashboards", body: "{}"},
		{method: "GET", path: "/api/ruler/grafana/api/v1/rules"},
		{method: "GET", path: "/api/v1/provisioning/alert-rules"},
	}
}

func snapshotKeys(t *testing.T, tp topology) map[string]bool {
	t.Helper()
	var list []struct {
		Key string `json:"key"`
	}
	keys := map[string]bool{}
	if r := adminCall(t, tp, http.MethodGet, "/api/dashboard/snapshots", nil); json.Unmarshal(r.body, &list) == nil {
		for _, s := range list {
			keys[s.Key] = true
		}
	}
	return keys
}

// cleanupProbeArtifacts deletes snapshots and public dashboards the admin-path probes may have created.
func cleanupProbeArtifacts(t *testing.T, tp topology) {
	t.Helper()
	before := snapshotKeys(t, tp)
	t.Cleanup(func() {
		for k := range snapshotKeys(t, tp) {
			if !before[k] {
				adminCall(t, tp, http.MethodDelete, "/api/snapshots/"+k, nil)
			}
		}
		const pd = "/api/dashboards/uid/ai_throughput_overview/public-dashboards"
		r := adminCall(t, tp, http.MethodGet, pd, nil)
		var one struct {
			UID    string `json:"uid"`
			Public []struct {
				UID string `json:"uid"`
			} `json:"publicDashboards"`
		}
		if json.Unmarshal(r.body, &one) != nil {
			return
		}
		uids := []string{one.UID}
		for _, p := range one.Public {
			uids = append(uids, p.UID)
		}
		for _, u := range uids {
			if u != "" {
				adminCall(t, tp, http.MethodDelete, pd+"/"+u, nil)
			}
		}
	})
}

func TestAdminOnlyPathsBlocked(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	eachEntry(t, func(t *testing.T, tg target) {
		cleanupProbeArtifacts(t, tg.topo)
		viewer, admin := tg.cookie(t, us.viewerA), tg.cookie(t, us.orgAdmin)
		root := tg.topo.root
		for _, ap := range adminOnlyPaths() {
			body := []byte(ap.body)
			if ap.canary {
				body = queryBody(t, tg.topo, mysqlUID, canarySQL())
			}
			seg, rest, _ := strings.Cut(strings.TrimPrefix(ap.path, "/"), "/")
			variants := map[string]string{
				"plain": root + ap.path, "upper": root + "/" + strings.ToUpper(seg) + "/" + rest, "double-slash": root + "/" + ap.path,
			}
			for vn, p := range variants {
				name := ap.method + " " + p + " (" + vn + ")"
				base := opts{contentType: jsonType, body: body, raw: true}
				vo := base
				vo.cookie = viewer
				wantGate(t, "viewer "+name, tg.call(t, "viewer "+name, ap.method, p, vo))
				ao := base
				ao.cookie, ao.leakOK = admin, true
				if r := tg.call(t, "orgAdmin "+name, ap.method, p, ao); answeredBy(r.body) == "gate" {
					t.Errorf("orgAdmin %s: answered by the gate (status %d)", name, r.status)
				}
			}
		}
	})
}

func TestSpoofedIdentityHeadersIgnored(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	wrongBasic := "Basic " + base64.StdEncoding.EncodeToString([]byte("gv-admin:definitely-wrong"))
	headers := map[string]string{
		"X-WEBAUTH-USER": "gv-admin", "X-Grafana-User": "gv-admin", "X-Forwarded-User": "gv-admin",
		"X-Forwarded-Email": "gv-admin@example.test", "Authorization": wrongBasic,
	}
	eachEdge(t, func(t *testing.T, tg target) {
		cookie := tg.cookie(t, us.viewerA)
		body := queryBody(t, tg.topo, mysqlUID, canarySQL())
		for k, v := range headers {
			tg.call(t, k, http.MethodPost, tg.path("/api/ds/query"), opts{cookie: cookie, contentType: jsonType, body: body, headers: map[string]string{k: v}})
		}
	})
}

func TestOrgAdminOrgOverride(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	eachEdge(t, func(t *testing.T, tg target) {
		cookie := tg.cookie(t, us.orgAdmin)
		body := queryBody(t, tg.topo, mysqlUID, canarySQL())
		q := tg.path("/api/ds/query")
		r := tg.call(t, "org-id-1", http.MethodPost, q, opts{cookie: cookie, contentType: jsonType, body: body, leakOK: true, headers: map[string]string{"X-Grafana-Org-Id": "1"}})
		wantStatus(t, "org-id-1", r, http.StatusOK)
		if !leaked(r.body) {
			t.Error("org-id-1: canary missing")
		}
		tg.call(t, "org-id-2", http.MethodPost, q, opts{cookie: cookie, contentType: jsonType, body: body, headers: map[string]string{"X-Grafana-Org-Id": "2"}})
		tg.call(t, "query-orgId-2", http.MethodPost, q+"?orgId=2", opts{cookie: cookie, contentType: jsonType, body: body})
	})
}

func TestUnauthenticated(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	eachEntry(t, func(t *testing.T, tg target) {
		body := queryBody(t, tg.topo, mysqlUID, canarySQL())
		cases := []struct {
			name string
			o    opts
		}{
			{"no-credentials", opts{}},
			{"garbage-session", opts{cookie: "grafana_session=garbage"}},
			{"wrong-basic-password", opts{basicUser: us.viewerA.login, basicPass: "wrong-" + randHex(4)}},
		}
		for _, c := range cases {
			c.o.contentType, c.o.body, c.o.noRefresh = jsonType, body, true
			r := tg.call(t, c.name, http.MethodPost, tg.path("/api/ds/query"), c.o)
			wantStatus(t, c.name, r, http.StatusUnauthorized)
			if c.name == "garbage-session" && answeredBy(r.body) != "grafana" {
				t.Errorf("%s: 401 came from the gate, want Grafana's", c.name)
			}
		}
	})
}

func TestBasicAuthViewer(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	projA := needProjects(t, us.viewerA.login)
	eachEdge(t, func(t *testing.T, tg target) {
		o := opts{basicUser: us.viewerA.login, basicPass: us.viewerA.password, contentType: jsonType}
		o.body = queryBody(t, tg.topo, mysqlUID, savedSQL(t, panelTasks, us.viewerA.login, projA))
		wantStatus(t, "basic-saved", tg.call(t, "basic-saved", http.MethodPost, tg.path("/api/ds/query"), o), http.StatusOK)
		o.body = queryBody(t, tg.topo, mysqlUID, canarySQL())
		wantStatus(t, "basic-canary", tg.call(t, "basic-canary", http.MethodPost, tg.path("/api/ds/query"), o), http.StatusForbidden)
	})
}

func TestServiceAccountToken(t *testing.T) {
	requireMode(t, "enforce")
	eachEdge(t, func(t *testing.T, tg target) {
		sa := adminCall(t, tg.topo, http.MethodPost, "/api/serviceaccounts", map[string]string{"name": "gv-sa-" + randHex(4), "role": "Viewer"})
		wantStatus(t, "create service account", sa, http.StatusOK, http.StatusCreated)
		id := int64(requireJSONObject(t, sa.body)["id"].(float64))
		t.Cleanup(func() {
			adminCall(t, tg.topo, http.MethodDelete, "/api/serviceaccounts/"+strconv.FormatInt(id, 10), nil)
		})
		tok := adminCall(t, tg.topo, http.MethodPost, "/api/serviceaccounts/"+strconv.FormatInt(id, 10)+"/tokens", map[string]string{"name": "gv-token"})
		wantStatus(t, "create token", tok, http.StatusOK, http.StatusCreated)
		key, _ := requireJSONObject(t, tok.body)["key"].(string)
		if key == "" {
			t.Fatal("token response has no key")
		}
		body := queryBody(t, tg.topo, mysqlUID, canarySQL())
		r := tg.call(t, "bearer-canary", http.MethodPost, tg.path("/api/ds/query"), opts{bearer: key, contentType: jsonType, body: body})
		wantStatus(t, "bearer-canary", r, http.StatusUnauthorized, http.StatusForbidden, http.StatusBadGateway)
		t.Logf("service account token canary query: status %d answered by %s", r.status, answeredBy(r.body))
	})
}

func TestExtraCookiesTolerated(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	projA := needProjects(t, us.viewerA.login)
	eachEdge(t, func(t *testing.T, tg target) {
		cookie := tg.cookie(t, us.viewerA) + "; devlake_session=x; _ga=GA1.1.1"
		r := tg.dsQuery(t, "extra-cookies", cookie, queryBody(t, tg.topo, mysqlUID, savedSQL(t, panelTasks, us.viewerA.login, projA)))
		wantStatus(t, "extra-cookies", r, http.StatusOK)
	})
}
