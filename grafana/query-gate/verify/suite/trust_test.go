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
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

const trustTag = "devlake:all-projects"

func dashboardBody(uid string, tags []string, sqls ...string) map[string]any {
	if tags == nil {
		tags = []string{}
	}
	panels := make([]map[string]any, len(sqls))
	for i, sql := range sqls {
		ds := map[string]string{"type": "mysql", "uid": mysqlUID}
		panels[i] = map[string]any{
			"id": i + 1, "type": "table", "title": "gv panel", "datasource": ds,
			"gridPos": map[string]int{"h": 8, "w": 12, "x": 0, "y": i * 8},
			"targets": []map[string]any{{"refId": "A", "datasource": ds, "rawSql": sql, "format": "table"}},
		}
	}
	return map[string]any{
		"dashboard": map[string]any{"uid": uid, "title": uid, "tags": tags, "schemaVersion": 39, "panels": panels},
		"overwrite": true,
	}
}

func (tg target) apiJSON(t *testing.T, name, cookie, method, p string, body any) reply {
	t.Helper()
	o := opts{cookie: cookie, contentType: jsonType, leakOK: true}
	if body != nil {
		o.body = mustJSON(t, body)
	}
	return tg.call(t, name, method, tg.path(p), o)
}

// saveDashboard saves the dashboard as the cookie's user.
func (tg target) saveDashboard(t *testing.T, name, cookie string, payload map[string]any) {
	t.Helper()
	wantStatus(t, name, tg.apiJSON(t, name, cookie, http.MethodPost, "/api/dashboards/db", payload), http.StatusOK)
}

func (tg target) cleanupDashboard(t *testing.T, uid string) {
	t.Helper()
	t.Cleanup(func() { adminCall(t, tg.topo, http.MethodDelete, "/api/dashboards/uid/"+uid, nil) })
}

func TestUIDashboardTrustLifecycle(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	eachEdge(t, func(t *testing.T, tg target) {
		t.Parallel()
		marker, uid := "gvm_"+randHex(6), "gv-trust-"+randHex(4)
		sql := "SELECT '" + marker + "' AS c"
		payload := dashboardBody(uid, []string{trustTag}, sql)
		orgAdmin, editor, viewer := tg.cookie(t, us.orgAdmin), tg.cookie(t, us.editor), tg.cookie(t, us.viewerA)
		tg.cleanupDashboard(t, uid)
		body := queryBody(t, tg.topo, mysqlUID, sql)
		accepted := func() bool {
			r := tg.dsQuery(t, "viewer-marker", viewer, body)
			return r.status == http.StatusOK && strings.Contains(string(r.body), marker)
		}
		tg.saveDashboard(t, "orgAdmin-save", orgAdmin, payload)
		// Grafana 13 gives the Editor role no access to another user's dashboard until an admin grants it.
		perms := tg.apiJSON(t, "grant-editor", orgAdmin, http.MethodPost, "/api/dashboards/uid/"+uid+"/permissions",
			map[string]any{"items": []map[string]any{{"role": "Editor", "permission": 2}, {"role": "Viewer", "permission": 1}}})
		wantStatus(t, "grant-editor", perms, http.StatusOK)
		t.Logf("trusted after %s", poll(t, 40*time.Second, 2*time.Second, accepted))
		// Grafana caches a session's permissions for about a minute, with or without the gate, so the grant shows up late.
		var got reply
		t.Logf("editor can read after %s", poll(t, 120*time.Second, 5*time.Second, func() bool {
			got = tg.apiJSON(t, "editor-get", editor, http.MethodGet, "/api/dashboards/uid/"+uid, nil)
			return got.status == http.StatusOK
		}))
		// The editor changes the SQL; Grafana records an identical save as no new version, so a real edit is needed.
		edited := requireJSONObject(t, got.body)["dashboard"]
		editorMarker := "gvm_" + randHex(6)
		editorSQL := "SELECT '" + editorMarker + "' AS c"
		raw, err := json.Marshal(edited)
		if err != nil {
			t.Fatal(err)
		}
		var editedDash map[string]any
		if err := json.Unmarshal([]byte(strings.ReplaceAll(string(raw), marker, editorMarker)), &editedDash); err != nil {
			t.Fatal(err)
		}
		tg.saveDashboard(t, "editor-resave", editor, map[string]any{"dashboard": editedDash, "overwrite": true})
		editorBody := queryBody(t, tg.topo, mysqlUID, editorSQL)
		t.Logf("untrusted after %s", poll(t, 40*time.Second, 2*time.Second, func() bool {
			return tg.dsQuery(t, "viewer-marker", viewer, body).status == http.StatusForbidden &&
				tg.dsQuery(t, "viewer-editor-sql", viewer, editorBody).status == http.StatusForbidden
		}))
		for i := 0; i < 3; i++ {
			time.Sleep(5 * time.Second)
			if r := tg.dsQuery(t, "viewer-editor-sql", viewer, editorBody); r.status != http.StatusForbidden || strings.Contains(string(r.body), editorMarker) {
				t.Fatalf("editor's SQL became runnable for a viewer: status %d", r.status)
			}
		}
		tg.saveDashboard(t, "orgAdmin-resave", orgAdmin, payload)
		t.Logf("trusted again after %s", poll(t, 40*time.Second, 2*time.Second, accepted))
	})
}

func TestUntaggedAdminDashboardNeedsLogin(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	eachEdge(t, func(t *testing.T, tg target) {
		t.Parallel()
		marker, uid := "gvm_"+randHex(6), "gv-untagged-"+randHex(4)
		plain := "SELECT '" + marker + "' AS c"
		withLogin := plain + " FROM DUAL WHERE ${__user.login:sqlstring} <> ''"
		tg.cleanupDashboard(t, uid)
		tg.saveDashboard(t, "orgAdmin-save", tg.cookie(t, us.orgAdmin), dashboardBody(uid, nil, plain, withLogin))
		time.Sleep(25 * time.Second)
		viewer := tg.cookie(t, us.viewerA)
		wantGate(t, "plain", tg.dsQuery(t, "plain", viewer, queryBody(t, tg.topo, mysqlUID, plain)))
		r := tg.dsQuery(t, "login-A", viewer, queryBody(t, tg.topo, mysqlUID, interpolate(withLogin, us.viewerA.login, nil)))
		wantStatus(t, "login-A", r, http.StatusOK)
		if !strings.Contains(string(r.body), marker) {
			t.Error("login-A: marker missing from the response")
		}
		wantGate(t, "login-B", tg.dsQuery(t, "login-B", viewer, queryBody(t, tg.topo, mysqlUID, interpolate(withLogin, us.viewerB.login, nil))))
	})
}

func TestEditorDashboardNeverTrusted(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	eachEdge(t, func(t *testing.T, tg target) {
		t.Parallel()
		marker, uid := "gvm_"+randHex(6), "gv-editor-"+randHex(4)
		sql := "SELECT '" + marker + "' AS c"
		tg.cleanupDashboard(t, uid)
		editor := tg.cookie(t, us.editor)
		tg.saveDashboard(t, "editor-save", editor, dashboardBody(uid, []string{trustTag}, sql))
		// Shared with Viewers so the sync account can read it; otherwise the rejection would prove nothing.
		perms := tg.apiJSON(t, "editor-share", editor, http.MethodPost, "/api/dashboards/uid/"+uid+"/permissions",
			map[string]any{"items": []map[string]any{{"role": "Viewer", "permission": 1}, {"role": "Editor", "permission": 2}}})
		wantStatus(t, "editor-share", perms, http.StatusOK)
		system := tg.cookie(t, us.system)
		t.Logf("sync account can read it after %s", poll(t, 120*time.Second, 5*time.Second, func() bool {
			return tg.apiJSON(t, "system-get", system, http.MethodGet, "/apis/dashboard.grafana.app/v1beta1/namespaces/default/dashboards/"+uid, nil).status == http.StatusOK
		}))
		time.Sleep(25 * time.Second)
		wantGate(t, "viewer-marker", tg.dsQuery(t, "viewer-marker", tg.cookie(t, us.viewerA), queryBody(t, tg.topo, mysqlUID, sql)))
	})
}

func TestEditorPanelPreviewRejected(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	projA := needProjects(t, us.viewerA.login)
	eachEntry(t, func(t *testing.T, tg target) {
		cookie := tg.cookie(t, us.editor)
		wantGate(t, "editor-canary", tg.dsQuery(t, "editor-canary", cookie, queryBody(t, tg.topo, mysqlUID, canarySQL())))
		saved := queryBody(t, tg.topo, mysqlUID, savedSQL(t, panelTasks, us.editor.login, projA))
		wantStatus(t, "editor-saved", tg.dsQuery(t, "editor-saved", cookie, saved), http.StatusOK)
	})
}
