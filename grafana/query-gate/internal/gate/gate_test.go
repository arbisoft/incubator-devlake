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

package gate

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/grafana/query-gate/internal/config"
	"github.com/apache/incubator-devlake/grafana/query-gate/internal/identity"
	gatesync "github.com/apache/incubator-devlake/grafana/query-gate/internal/sync"
	"github.com/apache/incubator-devlake/grafana/query-gate/internal/templates"
)

const (
	ownSQL    = "SELECT a FROM t WHERE owner = ${__user.login:sqlstring}"
	sharedSQL = "SELECT total FROM everyone"
)

const testDashboard = `{"title":"D","panels":[{"title":"P","targets":[{"refId":"A","rawSql":"` + ownSQL + `"}]}]}`

const sharedDashboard = `{"title":"S","tags":["devlake:all-projects"],"panels":[{"title":"P","targets":[{"refId":"A","rawSql":"` + sharedSQL + `"}]}]}`

type received struct {
	method, path, contentType string
	contentLength             int64
	body                      []byte
	header                    http.Header
}

type upstream struct {
	srv           *httptest.Server
	mu            sync.Mutex
	got           []received
	identityCalls atomic.Int32
	healthStatus  atomic.Int32
	// hold, when set before any request, blocks query requests after they are recorded.
	hold chan struct{}
}

func (u *upstream) received() []received {
	u.mu.Lock()
	defer u.mu.Unlock()
	return append([]received(nil), u.got...)
}

func newUpstream(t *testing.T) *upstream {
	t.Helper()
	u := &upstream{}
	u.healthStatus.Store(200)
	u.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/grafana")
		switch path {
		case "/api/user", "/api/user/orgs":
			if r.Method == http.MethodGet {
				u.identityCalls.Add(1)
				serveIdentity(w, r, path)
				return
			}
		case "/api/health":
			w.WriteHeader(int(u.healthStatus.Load()))
			return
		case "/api/live/ws":
			if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
				serveUpgrade(w)
				return
			}
		}
		body, _ := io.ReadAll(r.Body)
		u.mu.Lock()
		u.got = append(u.got, received{r.Method, r.URL.Path, r.Header.Get("Content-Type"), r.ContentLength, body, r.Header.Clone()})
		u.mu.Unlock()
		if u.hold != nil && path == "/api/ds/query" {
			<-u.hold
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	t.Cleanup(u.srv.Close)
	return u
}

func serveIdentity(w http.ResponseWriter, r *http.Request, path string) {
	cookie := r.Header.Get("Cookie")
	switch cookie {
	case "expired":
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(w, `{"message":"Session expired","traceID":"abc"}`)
		return
	case "broken":
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	login, role, server := "alice", "Viewer", false
	switch cookie {
	case "bob":
		login = "bob"
	case "orgadmin":
		login, role = "orgadmin", "Admin"
	case "root":
		login, server = "root", true
	}
	if path == "/api/user" {
		_ = json.NewEncoder(w).Encode(map[string]any{"login": login, "email": login + "@example.test", "orgId": 1, "isGrafanaAdmin": server})
		return
	}
	_ = json.NewEncoder(w).Encode([]map[string]any{{"orgId": 1, "role": role}})
}

func serveUpgrade(w http.ResponseWriter) {
	conn, rw, err := w.(http.Hijacker).Hijack()
	if err != nil {
		return
	}
	defer conn.Close()
	_, _ = rw.WriteString("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
	_ = rw.Flush()
	buf := make([]byte, 4)
	if _, err := io.ReadFull(rw, buf); err == nil {
		_, _ = conn.Write(buf)
	}
}

type harness struct {
	up   *upstream
	gate *httptest.Server
	logs *bytes.Buffer
}

func newHarness(t *testing.T, mode config.Mode, root string) *harness {
	t.Helper()
	return newCustomHarness(t, mode, root, nil)
}

// newCustomHarness lets tests adjust the gate and wrap the template source before it serves.
func newCustomHarness(t *testing.T, mode config.Mode, root string, tweak func(g *Gate, sets *func() *templates.Set)) *harness {
	t.Helper()
	up := newUpstream(t)
	target, err := url.Parse(up.srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{Mode: mode, Upstream: target, RootPath: root, MySQLUIDs: map[string]bool{"devlake-mysql": true}}
	own, errs := templates.LoadDashboard([]byte(testDashboard), "t")
	shared, errs2 := templates.LoadDashboard([]byte(sharedDashboard), "t")
	if len(errs)+len(errs2) != 0 {
		t.Fatal(errs, errs2)
	}
	set := templates.NewSet(own, shared)
	logs := &bytes.Buffer{}
	sets := func() *templates.Set { return set }
	status := func() gatesync.Status { return gatesync.Status{} }
	g := New(cfg, target, identity.New(target, root), sets, status, slog.New(slog.NewJSONHandler(logs, nil))).(*Gate)
	if tweak != nil {
		tweak(g, &g.sets)
	}
	srv := httptest.NewServer(g)
	t.Cleanup(srv.Close)
	return &harness{up: up, gate: srv, logs: logs}
}

func queryBody(sql string) string {
	b, _ := json.Marshal(sql)
	return `{ "to": "2", "queries": [ {"rawSql": ` + string(b) + `, "refId": "A", "datasource": {"uid": "devlake-mysql", "type": "mysql"}} ], "from": "1" }`
}

func (h *harness) do(t *testing.T, method, path, cookie, contentType, body string, headers ...string) (int, string) {
	t.Helper()
	req, err := http.NewRequest(method, h.gate.URL+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(data)
}

func (h *harness) query(t *testing.T, cookie, sql string) (int, string) {
	return h.do(t, http.MethodPost, "/api/ds/query", cookie, "application/json", queryBody(sql))
}

const aliceSQL = "SELECT a FROM t WHERE owner = 'alice'"

func TestAdminBypassForwardsOriginalBody(t *testing.T) {
	for _, cookie := range []string{"orgadmin", "root"} {
		h := newHarness(t, config.ModeEnforce, "")
		body := queryBody("DROP TABLE x")
		status, _ := h.do(t, http.MethodPost, "/api/ds/query", cookie, "application/json", body)
		got := h.up.received()
		if status != 200 || len(got) != 1 || string(got[0].body) != body {
			t.Fatalf("%s: status %d, got %+v", cookie, status, got)
		}
	}
}

func TestViewerAcceptedForwardsCanonicalBody(t *testing.T) {
	h := newHarness(t, config.ModeEnforce, "")
	status, _ := h.query(t, "alice", aliceSQL)
	got := h.up.received()
	if status != 200 || len(got) != 1 {
		t.Fatalf("status %d, got %+v", status, got)
	}
	if string(got[0].body) == queryBody(aliceSQL) || got[0].contentLength != int64(len(got[0].body)) {
		t.Fatalf("not canonical or wrong length: %s (%d)", got[0].body, got[0].contentLength)
	}
	if strings.Index(string(got[0].body), `"from"`) > strings.Index(string(got[0].body), `"queries"`) {
		t.Fatalf("keys not sorted: %s", got[0].body)
	}
}

func TestAllProjectsDashboardAcceptedForViewer(t *testing.T) {
	h := newHarness(t, config.ModeEnforce, "")
	if status, body := h.query(t, "alice", sharedSQL); status != 200 {
		t.Fatalf("status %d %s", status, body)
	}
}

func TestRejections(t *testing.T) {
	tests := []struct {
		name, method, cookie, ctype, body string
		headers                           []string
		want                              int
	}{
		{name: "free SQL", method: "POST", cookie: "alice", ctype: "application/json", body: queryBody("SELECT * FROM secrets"), want: 403},
		{name: "login swap", method: "POST", cookie: "bob", ctype: "application/json", body: queryBody(aliceSQL), want: 403},
		{name: "prometheus uid", method: "POST", cookie: "alice", ctype: "application/json",
			body: `{"queries":[{"refId":"A","datasource":{"uid":"prom","type":"prometheus"},"expr":"up"}]}`, want: 403},
		{name: "RAWSQL key", method: "POST", cookie: "alice", ctype: "application/json",
			body: `{"queries":[{"refId":"A","datasource":{"uid":"devlake-mysql"},"rawSql":"` + aliceSQL + `","RAWSQL":"DROP"}]}`, want: 400},
		{name: "invalid JSON", method: "POST", cookie: "alice", ctype: "application/json", body: `{`, want: 400},
		{name: "GET on query", method: "GET", cookie: "alice", ctype: "application/json", want: 403},
		{name: "gzip", method: "POST", cookie: "alice", ctype: "application/json", body: queryBody(aliceSQL), headers: []string{"Content-Encoding", "gzip"}, want: 415},
		{name: "text/plain", method: "POST", cookie: "alice", ctype: "text/plain", body: queryBody(aliceSQL), want: 415},
		{name: "no content type", method: "POST", cookie: "alice", body: queryBody(aliceSQL), want: 415},
		{name: "too large", method: "POST", cookie: "alice", ctype: "application/json", body: `{"x":"` + strings.Repeat("a", 17<<20) + `"}`, want: 413},
		{name: "admin-only path", method: "POST", cookie: "alice", ctype: "application/json", body: "{}", want: 403},
		{name: "unauthenticated", method: "POST", ctype: "application/json", body: queryBody(aliceSQL), want: 401},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t, config.ModeEnforce, "")
			path := "/api/ds/query"
			if tt.name == "admin-only path" {
				path = "/api/datasources/proxy/uid/devlake-mysql/query"
			}
			status, body := h.do(t, tt.method, path, tt.cookie, tt.ctype, tt.body, tt.headers...)
			if status != tt.want {
				t.Fatalf("status %d (%s), want %d", status, body, tt.want)
			}
			if len(h.up.received()) != 0 {
				t.Fatal("upstream was called")
			}
			if status == 401 {
				if body != `{"message":"Unauthorized"}` {
					t.Fatalf("body = %s", body)
				}
			} else if !strings.Contains(body, `"messageId":"querygate.blocked"`) || !strings.Contains(body, "Blocked by the query gate: ") {
				t.Fatalf("body = %s", body)
			}
		})
	}
}

func TestAdminOnlyPathForAdmin(t *testing.T) {
	h := newHarness(t, config.ModeEnforce, "")
	if status, _ := h.do(t, http.MethodGet, "/api/datasources/proxy/uid/x/q", "orgadmin", "", ""); status != 200 {
		t.Fatalf("status %d", status)
	}
	if len(h.up.received()) != 1 {
		t.Fatal("not forwarded")
	}
}

func TestPassThroughNeedsNoIdentity(t *testing.T) {
	h := newHarness(t, config.ModeEnforce, "")
	if status, _ := h.do(t, http.MethodGet, "/d/abc/dash", "", "", ""); status != 200 {
		t.Fatalf("status %d", status)
	}
	if h.up.identityCalls.Load() != 0 {
		t.Fatal("identity looked up for a pass-through path")
	}
}

func TestIdentityUnauthorizedRelayedAsIs(t *testing.T) {
	for _, mode := range []config.Mode{config.ModeEnforce, config.ModeReport} {
		h := newHarness(t, mode, "")
		status, body := h.query(t, "expired", aliceSQL)
		if status != 401 || body != `{"message":"Session expired","traceID":"abc"}` {
			t.Fatalf("%s: status %d body %s", mode, status, body)
		}
		if len(h.up.received()) != 0 {
			t.Fatal("upstream was called")
		}
	}
}

func TestIdentityErrorBecomesBadGatewayInEnforce(t *testing.T) {
	h := newHarness(t, config.ModeEnforce, "")
	status, body := h.query(t, "broken", aliceSQL)
	if status != 502 || body != `{"message":"Query gate could not verify the session"}` {
		t.Fatalf("status %d body %s", status, body)
	}
	if !strings.Contains(h.logs.String(), `"event":"identity_error"`) {
		t.Fatalf("logs: %s", h.logs)
	}
}

func TestReportModeForwardsOriginalAndLogsWithoutSQL(t *testing.T) {
	h := newHarness(t, config.ModeReport, "")
	const sql = "SELECT secret_column FROM secrets"
	body := queryBody(sql)
	status, _ := h.do(t, http.MethodPost, "/api/ds/query", "alice", "application/json", body, "X-Dashboard-Uid", "dash1", "X-Panel-Id", "7")
	got := h.up.received()
	if status != 200 || len(got) != 1 || string(got[0].body) != body {
		t.Fatalf("status %d, got %+v", status, got)
	}
	sum := sha256.Sum256([]byte(sql))
	var line map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(h.logs.Bytes()), &line); err != nil {
		t.Fatalf("log line: %v\n%s", err, h.logs)
	}
	want := map[string]any{
		"event": "would_reject", "mode": "report", "login": "alice", "admin": false, "method": "POST", "path": "/api/ds/query",
		"ref_id": "A", "sql_sha256": hex.EncodeToString(sum[:])[:16], "dashboard_uid": "dash1", "panel_id": "7",
	}
	for k, v := range want {
		if line[k] != v {
			t.Errorf("log %s = %v, want %v", k, line[k], v)
		}
	}
	if line["reason"] == "" || line["reason"] == nil {
		t.Error("log has no reason")
	}
	for _, secret := range []string{sql, "secret_column"} {
		if strings.Contains(h.logs.String(), secret) {
			t.Errorf("log leaks %q", secret)
		}
	}
}

func TestReportModeForwardsUnauthenticatedAndAdminOnly(t *testing.T) {
	h := newHarness(t, config.ModeReport, "")
	if status, _ := h.do(t, http.MethodPost, "/api/ds/query", "", "application/json", queryBody("x")); status != 200 {
		t.Fatalf("unauthenticated status %d", status)
	}
	if status, _ := h.do(t, http.MethodGet, "/api/snapshots", "alice", "", ""); status != 200 {
		t.Fatalf("admin-only status %d", status)
	}
	if n := strings.Count(h.logs.String(), `"event":"would_reject"`); n != 2 {
		t.Fatalf("would_reject lines = %d\n%s", n, h.logs)
	}
}

func TestOffModeMakesNoIdentityCalls(t *testing.T) {
	h := newHarness(t, config.ModeOff, "")
	body := queryBody("DROP TABLE x")
	status, _ := h.do(t, http.MethodPost, "/api/ds/query", "alice", "application/json", body)
	got := h.up.received()
	if status != 200 || len(got) != 1 || string(got[0].body) != body || h.up.identityCalls.Load() != 0 {
		t.Fatalf("status %d, got %d, identity calls %d", status, len(got), h.up.identityCalls.Load())
	}
}

func TestRootPath(t *testing.T) {
	h := newHarness(t, config.ModeEnforce, "/grafana")
	for _, p := range []string{"/grafana/api/ds/query", "/api/ds/query"} {
		if status, _ := h.do(t, http.MethodPost, p, "alice", "application/json", queryBody("SELECT 1")); status != 403 {
			t.Fatalf("%s: status %d, want 403", p, status)
		}
	}
	if status, _ := h.do(t, http.MethodPost, "/grafana/api/ds/query", "alice", "application/json", queryBody(aliceSQL)); status != 200 {
		t.Fatalf("accepted query status %d", status)
	}
	got := h.up.received()
	if len(got) != 1 || got[0].path != "/grafana/api/ds/query" {
		t.Fatalf("got %+v", got)
	}
}

func TestWebSocketUpgradeReachesUpstream(t *testing.T) {
	h := newHarness(t, config.ModeEnforce, "")
	conn, err := net.Dial("tcp", strings.TrimPrefix(h.gate.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_, _ = io.WriteString(conn, "GET /api/live/ws HTTP/1.1\r\nHost: example.test\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n")
	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, nil)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("status %d", resp.StatusCode)
	}
	_, _ = io.WriteString(conn, "ping")
	buf := make([]byte, 4)
	if _, err := io.ReadFull(br, buf); err != nil || string(buf) != "ping" {
		t.Fatalf("echo %q %v", buf, err)
	}
}

func TestHostIsPreserved(t *testing.T) {
	h := newHarness(t, config.ModeEnforce, "")
	req, _ := http.NewRequest(http.MethodGet, h.gate.URL+"/d/x", nil)
	req.Host = "grafana.example.test"
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	got := h.up.received()
	if len(got) != 1 || got[0].header.Get("X-Forwarded-Host") != "grafana.example.test" {
		t.Fatalf("got %+v", got)
	}
}

func TestForwardedHeadersPassThrough(t *testing.T) {
	inbound := []string{
		"X-Forwarded-For", "203.0.113.7", "X-Forwarded-Proto", "https",
		"X-Forwarded-Host", "aperture.example.test", "Forwarded", "for=203.0.113.7;proto=https",
	}
	tests := []struct {
		name, path, cookie, body string
		headers                  []string
		xff, proto, host, fwd    string
	}{
		{"pass-through path", "/d/x", "", "", inbound, "203.0.113.7, 127.0.0.1", "https", "aperture.example.test", "for=203.0.113.7;proto=https"},
		{"accepted viewer query", "/api/ds/query", "alice", queryBody(aliceSQL), inbound, "203.0.113.7, 127.0.0.1", "https", "aperture.example.test", "for=203.0.113.7;proto=https"},
		{"no inbound headers", "/d/x", "", "", nil, "127.0.0.1", "http", "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t, config.ModeEnforce, "")
			ctype := ""
			method := http.MethodGet
			if tt.body != "" {
				ctype, method = "application/json", http.MethodPost
			}
			if status, body := h.do(t, method, tt.path, tt.cookie, ctype, tt.body, tt.headers...); status != 200 {
				t.Fatalf("status %d %s", status, body)
			}
			got := h.up.received()
			if len(got) != 1 {
				t.Fatalf("got %+v", got)
			}
			hd := got[0].header
			if hd.Get("X-Forwarded-For") != tt.xff || hd.Get("X-Forwarded-Proto") != tt.proto ||
				!(tt.host == "" || hd.Get("X-Forwarded-Host") == tt.host) || hd.Get("Forwarded") != tt.fwd {
				t.Fatalf("headers = %v", hd)
			}
		})
	}
}

func TestOrgAdminBypassOnlyForCurrentOrg(t *testing.T) {
	tests := []struct {
		name, cookie, path string
		headers            []string
		bypass             bool
	}{
		{"org admin without org hint", "orgadmin", "/api/ds/query", nil, true},
		{"org admin header equal to current org", "orgadmin", "/api/ds/query", []string{"X-Grafana-Org-Id", "1"}, true},
		{"org admin query equal to current org", "orgadmin", "/api/ds/query?orgId=1", nil, true},
		{"org admin header for another org", "orgadmin", "/api/ds/query", []string{"X-Grafana-Org-Id", "2"}, false},
		{"org admin query for another org", "orgadmin", "/api/ds/query?orgId=2", nil, false},
		{"org admin header not a number", "orgadmin", "/api/ds/query", []string{"X-Grafana-Org-Id", "abc"}, false},
		{"org admin header empty", "orgadmin", "/api/ds/query", []string{"X-Grafana-Org-Id", ""}, false},
		{"org admin query empty", "orgadmin", "/api/ds/query?orgId=", nil, false},
		{"org admin header current but query other", "orgadmin", "/api/ds/query?orgId=2", []string{"X-Grafana-Org-Id", "1"}, false},
		{"org admin repeated query, one other", "orgadmin", "/api/ds/query?orgId=1&orgId=2", nil, false},
		{"server admin header for another org", "root", "/api/ds/query", []string{"X-Grafana-Org-Id", "2"}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t, config.ModeEnforce, "")
			status, body := h.do(t, http.MethodPost, tt.path, tt.cookie, "application/json", queryBody("SELECT * FROM secrets"), tt.headers...)
			if tt.bypass && (status != 200 || len(h.up.received()) != 1) {
				t.Fatalf("status %d %s, want bypass", status, body)
			}
			if !tt.bypass && (status != 403 || len(h.up.received()) != 0) {
				t.Fatalf("status %d %s, want 403", status, body)
			}
		})
	}
}

func TestHealthEndpoints(t *testing.T) {
	h := newHarness(t, config.ModeReport, "")
	status, body := h.do(t, http.MethodGet, "/gate/healthz", "", "", "")
	if status != 200 || body != `{"mode":"report","status":"ok","sync":{"enabled":false,"consecutive_failures":0},"templates":2}` {
		t.Fatalf("healthz %d %s", status, body)
	}
	status, body = h.do(t, http.MethodGet, "/gate/readyz", "", "", "")
	if status != 200 || body != `{"status":"ready","sync":{"enabled":false,"consecutive_failures":0}}` {
		t.Fatalf("readyz %d %s", status, body)
	}
	h.up.healthStatus.Store(503)
	status, body = h.do(t, http.MethodGet, "/gate/readyz", "", "", "")
	if status != 503 || body != `{"status":"unavailable","sync":{"enabled":false,"consecutive_failures":0}}` {
		t.Fatalf("readyz down %d %s", status, body)
	}
	h.up.srv.Close()
	status, _ = h.do(t, http.MethodGet, "/gate/readyz", "", "", "")
	if status != 503 {
		t.Fatalf("readyz unreachable %d", status)
	}
}

func TestUpstreamDownGivesBadGateway(t *testing.T) {
	h := newHarness(t, config.ModeOff, "")
	h.up.srv.Close()
	status, body := h.do(t, http.MethodGet, "/d/x", "", "", "")
	if status != 502 || !strings.Contains(body, "message") {
		t.Fatalf("status %d %s", status, body)
	}
}

func TestOrgAdminRequestIsPinnedToVerifiedOrg(t *testing.T) {
	tests := []struct {
		name, cookie string
		headers      []string
		want         string
	}{
		{"org admin without hint", "orgadmin", nil, "1"},
		{"server admin keeps the requested org", "root", []string{"X-Grafana-Org-Id", "2"}, "2"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t, config.ModeEnforce, "")
			status, body := h.do(t, http.MethodPost, "/api/ds/query", tt.cookie, "application/json", queryBody("SELECT 1"), tt.headers...)
			got := h.up.received()
			if status != 200 || len(got) != 1 {
				t.Fatalf("status %d %s, got %+v", status, body, got)
			}
			if v := got[0].header.Get("X-Grafana-Org-Id"); v != tt.want {
				t.Fatalf("upstream org header = %q, want %q", v, tt.want)
			}
		})
	}
}

func TestSelfUpdateCannotChangeScopingKeys(t *testing.T) {
	const full = `{"name":"Alice A","login":"alice","email":"alice@example.test","theme":"dark"}`
	tests := []struct {
		name, cookie, body string
		enforceStatus      int
		reportRejects      bool
	}{
		{"login change", "alice", `{"login":"bob"}`, 403, true},
		{"email change", "alice", `{"email":"bob@example.test"}`, 403, true},
		{"unchanged profile", "alice", full, 200, false},
		{"duplicate login keys", "alice", `{"login":"alice","LOGIN":"bob"}`, 400, true},
		{"login not a string", "alice", `{"login":5}`, 400, true},
		{"admin renames", "orgadmin", `{"login":"renamed"}`, 200, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t, config.ModeEnforce, "")
			status, body := h.do(t, http.MethodPut, "/api/user", tt.cookie, "application/json", tt.body)
			got := h.up.received()
			if status != tt.enforceStatus {
				t.Fatalf("enforce status %d %s, want %d", status, body, tt.enforceStatus)
			}
			if tt.enforceStatus == 200 && (len(got) != 1 || string(got[0].body) != tt.body) {
				t.Fatalf("enforce forwarded %+v", got)
			}
			if tt.enforceStatus != 200 && len(got) != 0 {
				t.Fatalf("enforce forwarded %+v", got)
			}
			r := newHarness(t, config.ModeReport, "")
			status, body = r.do(t, http.MethodPut, "/api/user", tt.cookie, "application/json", tt.body)
			got = r.up.received()
			if status != 200 || len(got) != 1 || string(got[0].body) != tt.body {
				t.Fatalf("report status %d %s, got %+v", status, body, got)
			}
			if has := strings.Contains(r.logs.String(), `"would_reject"`); has != tt.reportRejects {
				t.Fatalf("would_reject logged = %v, want %v:\n%s", has, tt.reportRejects, r.logs)
			}
		})
	}
	t.Run("reading the profile is not checked", func(t *testing.T) {
		h := newHarness(t, config.ModeEnforce, "")
		if status, body := h.do(t, http.MethodGet, "/api/user", "alice", "", ""); status != 200 {
			t.Fatalf("status %d %s", status, body)
		}
	})
}

func manyQueriesBody(n int, sql string) string {
	qs := make([]map[string]any, n)
	for i := range qs {
		qs[i] = map[string]any{"rawSql": sql, "refId": "A", "datasource": map[string]string{"uid": "devlake-mysql", "type": "mysql"}}
	}
	b, _ := json.Marshal(map[string]any{"queries": qs})
	return string(b)
}

func paddedBody(size int) string {
	b := queryBody("SELECT 1")
	return b + strings.Repeat(" ", size-len(b))
}

func TestRequestLimits(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		want       int
		wantReason string
	}{
		{"body over the limit", paddedBody(maxBodyBytes + 1), 413, reasonTooLarge},
		{"query over the limit", queryBody(strings.Repeat("a", maxSQLBytes+1)), 413, reasonQueryTooLarge},
		{"too many queries", manyQueriesBody(maxQueries+1, "SELECT 1"), 400, reasonTooManyQueries},
		{"at the query limit", manyQueriesBody(maxQueries, aliceSQL), 200, ""},
	}
	for _, mode := range []config.Mode{config.ModeEnforce, config.ModeReport} {
		for _, tt := range tests {
			t.Run(string(mode)+"/"+tt.name, func(t *testing.T) {
				h := newHarness(t, mode, "")
				status, body := h.do(t, http.MethodPost, "/api/ds/query", "alice", "application/json", tt.body)
				if status != tt.want {
					t.Fatalf("status %d %.200s, want %d", status, body, tt.want)
				}
				if tt.wantReason == "" {
					return
				}
				if !strings.Contains(body, tt.wantReason) || len(h.up.received()) != 0 {
					t.Fatalf("body %.200s, upstream %d", body, len(h.up.received()))
				}
			})
		}
	}
}

func TestMatchConcurrencyIsBounded(t *testing.T) {
	var inflight, peak atomic.Int32
	h := newCustomHarness(t, config.ModeEnforce, "", func(g *Gate, sets *func() *templates.Set) {
		g.sem = make(chan struct{}, 2)
		inner := *sets
		*sets = func() *templates.Set {
			n := inflight.Add(1)
			defer inflight.Add(-1)
			for p := peak.Load(); n > p && !peak.CompareAndSwap(p, n); p = peak.Load() {
			}
			time.Sleep(20 * time.Millisecond)
			return inner()
		}
	})
	var wg sync.WaitGroup
	statuses := make([]int, 10)
	for i := range statuses {
		wg.Add(1)
		go func() {
			defer wg.Done()
			statuses[i], _ = h.do(t, http.MethodPost, "/api/ds/query", "alice", "application/json", queryBody(aliceSQL))
		}()
	}
	wg.Wait()
	for i, st := range statuses {
		if st != 200 {
			t.Fatalf("request %d answered %d", i, st)
		}
	}
	if peak.Load() > 2 || peak.Load() == 0 {
		t.Fatalf("peak in flight = %d, want 1 or 2", peak.Load())
	}
}

func TestSlotIsReleasedBeforeForwarding(t *testing.T) {
	h := newCustomHarness(t, config.ModeEnforce, "", func(g *Gate, _ *func() *templates.Set) {
		g.sem = make(chan struct{}, 1)
	})
	h.up.hold = make(chan struct{})
	var once sync.Once
	release := func() { once.Do(func() { close(h.up.hold) }) }
	t.Cleanup(release)
	var wg sync.WaitGroup
	for range 2 {
		want := len(h.up.received()) + 1
		wg.Add(1)
		go func() {
			defer wg.Done()
			h.do(t, http.MethodPost, "/api/ds/query", "alice", "application/json", queryBody(aliceSQL))
		}()
		deadline := time.Now().Add(2 * time.Second)
		for len(h.up.received()) < want && time.Now().Before(deadline) {
			time.Sleep(5 * time.Millisecond)
		}
		if got := len(h.up.received()); got < want {
			release()
			wg.Wait()
			t.Fatalf("only %d queries reached upstream while the first was still being forwarded, want %d", got, want)
		}
	}
	release()
	wg.Wait()
}
