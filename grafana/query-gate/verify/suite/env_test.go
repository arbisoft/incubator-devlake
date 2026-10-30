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
	"bufio"
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

const (
	stagingHost = "aperture.arbisoft.com"
	prodHost    = "devlake-grafana.arbisoft.com"
	savedFile   = "AI Impact/AI Throughput Overview.json"
	panelTasks  = 4
	panelCover  = 15
	mysqlUID    = "devlake-mysql"
	prodExtraDS = "P430005175C4C7810"
	jsonType    = "application/json"
)

type topology struct {
	name    string
	edge    string
	root    string
	gate    string
	grafana string
	uids    []string
}

var topologies = []topology{
	{
		name: "staging", edge: "https://" + stagingHost + "/grafana", root: "/grafana",
		gate: "http://127.0.0.1:3011/grafana", grafana: "http://127.0.0.1:3013/grafana",
		uids: []string{mysqlUID},
	},
	{
		name: "prod", edge: "https://" + prodHost, root: "",
		gate: "http://127.0.0.1:3012",
		uids: []string{mysqlUID, prodExtraDS},
	},
}

func (tp topology) adminBase() string {
	if tp.grafana != "" {
		return tp.grafana
	}
	return tp.gate
}

func (tp topology) gateOrigin() string { return strings.TrimSuffix(tp.gate, tp.root) }

// target is one topology reached through one entry (edge or direct-gate).
type target struct {
	topo   topology
	entry  string
	origin string
	base   string
}

func edgeTarget(tp topology) target {
	return target{topo: tp, entry: "edge", origin: strings.TrimSuffix(tp.edge, tp.root), base: tp.edge}
}

func gateTarget(tp topology) target {
	return target{topo: tp, entry: "direct-gate", origin: tp.gateOrigin(), base: tp.gate}
}

func (tg target) path(p string) string { return tg.topo.root + p }

func eachTopology(t *testing.T, fn func(*testing.T, topology)) {
	t.Helper()
	for _, tp := range topologies {
		t.Run(tp.name, func(t *testing.T) { fn(t, tp) })
	}
}

func eachEdge(t *testing.T, fn func(*testing.T, target)) {
	t.Helper()
	eachTopology(t, func(t *testing.T, tp topology) { fn(t, edgeTarget(tp)) })
}

func eachEntry(t *testing.T, fn func(*testing.T, target)) {
	t.Helper()
	eachTopology(t, func(t *testing.T, tp topology) {
		for _, tg := range []target{edgeTarget(tp), gateTarget(tp)} {
			t.Run(tg.entry, func(t *testing.T) { fn(t, tg) })
		}
	})
}

// ---- environment ----

var envState struct {
	mu      sync.Mutex
	secrets map[string]string
	users   map[string]string
	pool    *x509.CertPool
	client  *http.Client
	tlsConf *tls.Config
}

func workDir(t *testing.T) string {
	t.Helper()
	w := os.Getenv("GV_WORK")
	if w == "" {
		t.Fatal("GV_WORK is not set: point it at the work directory written by verify/run.sh")
	}
	return w
}

func parseEnvFile(t *testing.T, name string) map[string]string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(workDir(t), name))
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	out := map[string]string{}
	for _, line := range strings.Split(string(raw), "\n") {
		k, v, ok := strings.Cut(strings.TrimSpace(line), "=")
		if ok && k != "" && !strings.HasPrefix(k, "#") {
			out[k] = v
		}
	}
	return out
}

func secrets(t *testing.T) map[string]string {
	t.Helper()
	envState.mu.Lock()
	defer envState.mu.Unlock()
	if envState.secrets == nil {
		envState.secrets = parseEnvFile(t, "secrets.env")
	}
	return envState.secrets
}

func userLogins(t *testing.T) map[string]string {
	t.Helper()
	envState.mu.Lock()
	defer envState.mu.Unlock()
	if envState.users == nil {
		envState.users = parseEnvFile(t, "users.env")
	}
	return envState.users
}

type user struct{ login, password string }

type userSet struct {
	admin, system, serverAdmin, orgAdmin, editor, viewerA, viewerB user
}

func loadUsers(t *testing.T) userSet {
	t.Helper()
	sec, lg := secrets(t), userLogins(t)
	get := func(m map[string]string, k string) string {
		v, ok := m[k]
		if !ok || v == "" {
			t.Fatalf("key %s missing from the work directory env files", k)
		}
		return v
	}
	return userSet{
		admin:       user{"gv-admin", get(sec, "GV_ADMIN_PASSWORD")},
		system:      user{get(lg, "GV_SYSTEM_LOGIN"), get(sec, "GV_SYSTEM_PASSWORD")},
		serverAdmin: user{get(lg, "GV_SERVERADMIN_LOGIN"), get(sec, "GV_SERVERADMIN_PASSWORD")},
		orgAdmin:    user{get(lg, "GV_ORGADMIN_LOGIN"), get(sec, "GV_ORGADMIN_PASSWORD")},
		editor:      user{get(lg, "GV_EDITOR_LOGIN"), get(sec, "GV_EDITOR_PASSWORD")},
		viewerA:     user{get(lg, "GV_VIEWER_A_LOGIN"), get(sec, "GV_VIEWER_A_PASSWORD")},
		viewerB:     user{get(lg, "GV_VIEWER_B_LOGIN"), get(sec, "GV_VIEWER_B_PASSWORD")},
	}
}

func dialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	switch addr {
	case stagingHost + ":443", prodHost + ":443":
		addr = "127.0.0.1:443"
	}
	var d net.Dialer
	return d.DialContext(ctx, network, addr)
}

func client(t *testing.T) *http.Client {
	t.Helper()
	pemBytes, err := os.ReadFile(filepath.Join(workDir(t), "certs", "ca.crt"))
	if err != nil {
		t.Fatalf("read CA: %v", err)
	}
	envState.mu.Lock()
	defer envState.mu.Unlock()
	if envState.client != nil {
		return envState.client
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pemBytes) {
		t.Fatal("certs/ca.crt holds no certificate")
	}
	envState.pool = pool
	envState.tlsConf = &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}
	envState.client = &http.Client{
		Timeout: 60 * time.Second,
		Transport: &http.Transport{
			DialContext:     dialContext,
			TLSClientConfig: envState.tlsConf,
		},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	return envState.client
}

// ---- requests ----

type opts struct {
	cookie      string
	basicUser   string
	basicPass   string
	bearer      string
	contentType string
	origin      string
	headers     map[string]string
	body        []byte
	chunked     bool
	raw         bool
	leakOK      bool
	noRefresh   bool
}

type reply struct {
	status int
	header http.Header
	body   []byte
	wire   string
}

func (o opts) buildHeader(targetURL string) http.Header {
	h := http.Header{}
	origin := o.origin
	if origin == "" {
		scheme, rest, _ := strings.Cut(targetURL, "://")
		host, _, _ := strings.Cut(rest, "/")
		origin = scheme + "://" + host
	}
	h.Set("Origin", origin)
	if o.cookie != "" {
		h.Set("Cookie", o.cookie)
	}
	switch {
	case o.basicUser != "":
		h.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(o.basicUser+":"+o.basicPass)))
	case o.bearer != "":
		h.Set("Authorization", "Bearer "+o.bearer)
	}
	if o.contentType != "" {
		h.Set("Content-Type", o.contentType)
	}
	for k, v := range o.headers {
		h.Set(k, v)
	}
	return h
}

func send(method, rawURL string, o opts) (reply, error) {
	envState.mu.Lock()
	c, conf := envState.client, envState.tlsConf
	envState.mu.Unlock()
	if c == nil {
		return reply{}, fmt.Errorf("client not initialised")
	}
	if o.raw {
		return rawSend(method, rawURL, o, conf)
	}
	var rdr io.Reader
	if o.body != nil {
		rdr = bytes.NewReader(o.body)
	}
	req, err := http.NewRequest(method, rawURL, rdr)
	if err != nil {
		return reply{}, err
	}
	if o.chunked {
		req.ContentLength = -1
	}
	req.Header = o.buildHeader(rawURL)
	resp, err := c.Do(req)
	if err != nil {
		return reply{}, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return reply{}, err
	}
	return reply{status: resp.StatusCode, header: resp.Header, body: body, wire: method + " " + req.URL.RequestURI()}, nil
}

// dialOrigin connects to scheme://host[:port], wrapping the connection in TLS for https.
func dialOrigin(ctx context.Context, origin string, conf *tls.Config) (net.Conn, string, error) {
	scheme, host, ok := strings.Cut(origin, "://")
	if !ok {
		return nil, "", fmt.Errorf("origin without scheme")
	}
	hostname, port, err := net.SplitHostPort(host)
	if err != nil {
		hostname, port = host, map[string]string{"https": "443", "http": "80"}[scheme]
	}
	conn, err := dialContext(ctx, "tcp", net.JoinHostPort(hostname, port))
	if err != nil {
		return nil, "", err
	}
	_ = conn.SetDeadline(time.Now().Add(60 * time.Second))
	if scheme != "https" {
		return conn, host, nil
	}
	tc := conf.Clone()
	tc.ServerName = hostname
	tconn := tls.Client(conn, tc)
	if err := tconn.HandshakeContext(ctx); err != nil {
		conn.Close()
		return nil, "", err
	}
	return tconn, host, nil
}

// rawSend writes the request target byte for byte so no client cleans the path.
func rawSend(method, rawURL string, o opts, conf *tls.Config) (reply, error) {
	scheme, rest, ok := strings.Cut(rawURL, "://")
	if !ok {
		return reply{}, fmt.Errorf("url without scheme")
	}
	hostPart, tail, _ := strings.Cut(rest, "/")
	target := "/" + tail
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	conn, host, err := dialOrigin(ctx, scheme+"://"+hostPart, conf)
	if err != nil {
		return reply{}, err
	}
	defer conn.Close()
	var b bytes.Buffer
	fmt.Fprintf(&b, "%s %s HTTP/1.1\r\nHost: %s\r\n", method, target, host)
	h := o.buildHeader(rawURL)
	if len(o.body) > 0 || method == http.MethodPost || method == http.MethodPut || method == http.MethodPatch {
		h.Set("Content-Length", strconv.Itoa(len(o.body)))
	}
	h.Set("Connection", "close")
	_ = h.Write(&b)
	b.WriteString("\r\n")
	b.Write(o.body)
	if _, err := conn.Write(b.Bytes()); err != nil {
		return reply{}, err
	}
	resp, err := http.ReadResponse(bufio.NewReader(conn), &http.Request{Method: method})
	if err != nil {
		return reply{}, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return reply{}, err
	}
	return reply{status: resp.StatusCode, header: resp.Header, body: body, wire: method + " " + target}, nil
}

func do(t *testing.T, method, rawURL string, o opts) reply {
	t.Helper()
	client(t)
	r, err := send(method, rawURL, o)
	if err != nil {
		t.Fatalf("%s %s: %v", method, rawURL, err)
	}
	return r
}

var sessions = struct {
	mu sync.Mutex
	m  map[string]string
}{m: map[string]string{}}

func sessionCookie(h http.Header) string {
	for _, c := range (&http.Response{Header: h}).Cookies() {
		if c.Name == "grafana_session" {
			return c.Name + "=" + c.Value
		}
	}
	return ""
}

func loginCookie(base string, u user) (string, error) {
	body, _ := json.Marshal(map[string]string{"user": u.login, "password": u.password})
	r, err := send(http.MethodPost, base+"/login", opts{contentType: jsonType, body: body})
	if err != nil {
		return "", err
	}
	if r.status != http.StatusOK {
		return "", fmt.Errorf("login of %s: status %d", u.login, r.status)
	}
	c := sessionCookie(r.header)
	if c == "" {
		return "", fmt.Errorf("login of %s set no grafana_session cookie", u.login)
	}
	return c, nil
}

// freshSession logs in anew; its cookie is never registered for renewal, so a 401 on it is always real.
func freshSession(t *testing.T, topo topology, base string, u user) string {
	t.Helper()
	client(t)
	c, err := loginCookie(base, u)
	if err != nil {
		t.Fatalf("%s: %v", topo.name, err)
	}
	return c
}

type sessionOwner struct {
	base string
	u    user
}

var sessionOwners = map[string]sessionOwner{}

var renewMu sync.Mutex

// renew swaps a stale cached session for a rotated one, or a fresh login when rotation fails.
func renew(t *testing.T, stale string) (string, error) {
	renewMu.Lock()
	defer renewMu.Unlock()
	sessions.mu.Lock()
	o, ok := sessionOwners[stale]
	key := o.base + "|" + o.u.login
	cur := sessions.m[key]
	sessions.mu.Unlock()
	if !ok {
		return "", fmt.Errorf("session is not a cached one")
	}
	if cur != stale {
		return cur, nil
	}
	fresh := ""
	if r, err := send(http.MethodPost, o.base+"/api/user/auth-tokens/rotate", opts{cookie: stale, contentType: jsonType, body: []byte("{}")}); err == nil && r.status == http.StatusOK {
		fresh = sessionCookie(r.header)
		if fresh != "" {
			t.Logf("session of %s rotated", o.u.login)
		}
	}
	if fresh == "" {
		c, err := loginCookie(o.base, o.u)
		if err != nil {
			return "", err
		}
		fresh = c
		t.Logf("session of %s replaced by a fresh login", o.u.login)
	}
	sessions.mu.Lock()
	sessions.m[key] = fresh
	sessionOwners[fresh] = o
	sessions.mu.Unlock()
	return fresh, nil
}

// sendRefreshing retries once with a renewed session when a cached session draws a 401.
func sendRefreshing(t *testing.T, method, rawURL string, o opts) (reply, error) {
	r, err := send(method, rawURL, o)
	if err != nil || r.status != http.StatusUnauthorized || o.noRefresh {
		return r, err
	}
	var stale string
	for _, p := range strings.Split(o.cookie, ";") {
		if p = strings.TrimSpace(p); strings.HasPrefix(p, "grafana_session=") {
			stale = p
		}
	}
	if stale == "" {
		return r, nil
	}
	fresh, rerr := renew(t, stale)
	if rerr != nil {
		return r, nil
	}
	o.cookie = strings.Replace(o.cookie, stale, fresh, 1)
	return send(method, rawURL, o)
}

func session(t *testing.T, topo topology, base string, u user) string {
	t.Helper()
	key := base + "|" + u.login
	sessions.mu.Lock()
	c, ok := sessions.m[key]
	sessions.mu.Unlock()
	if ok {
		return c
	}
	c = freshSession(t, topo, base, u)
	sessions.mu.Lock()
	sessions.m[key] = c
	sessionOwners[c] = sessionOwner{base, u}
	sessions.mu.Unlock()
	return c
}

func (tg target) cookie(t *testing.T, u user) string {
	t.Helper()
	return session(t, tg.topo, tg.base, u)
}

// ---- canary and probes ----

var canary = newCanary()

func newCanary() string {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return "gvc_" + hex.EncodeToString(b)
}

func canarySQL() string { return "SELECT '" + canary + "' AS c" }

func leaked(body []byte) bool { return bytes.Contains(body, []byte(canary)) }

func answeredBy(body []byte) string {
	var m struct {
		MessageID string `json:"messageId"`
		Message   string `json:"message"`
	}
	if json.Unmarshal(body, &m) == nil &&
		(m.MessageID == "querygate.blocked" || strings.HasPrefix(m.Message, "Query gate") || m.Message == "Upstream unavailable") {
		return "gate"
	}
	return "grafana"
}

type probe struct {
	topology string
	entry    string
	name     string
	method   string
	path     string
	status   int
	body     []byte
}

var probeMu sync.Mutex

func record(t *testing.T, p probe) {
	t.Helper()
	line, _ := json.Marshal(map[string]any{
		"test": t.Name(), "topology": p.topology, "entry": p.entry, "name": p.name,
		"method": p.method, "path": p.path, "status": p.status,
		"answered_by": answeredBy(p.body), "canary_leaked": leaked(p.body),
	})
	dir := filepath.Join(workDir(t), "results")
	probeMu.Lock()
	defer probeMu.Unlock()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Errorf("results dir: %v", err)
		return
	}
	f, err := os.OpenFile(filepath.Join(dir, "probes.jsonl"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		t.Errorf("open probes.jsonl: %v", err)
		return
	}
	defer f.Close()
	if _, err := f.Write(append(line, '\n')); err != nil {
		t.Errorf("write probes.jsonl: %v", err)
	}
}

// call sends one request to the target, records it, and fails on a canary leak unless opts.leakOK is set.
func (tg target) call(t *testing.T, name, method, p string, o opts) reply {
	t.Helper()
	client(t)
	r, err := sendRefreshing(t, method, tg.origin+p, o)
	if err != nil {
		t.Fatalf("%s %s: %v", method, p, err)
	}
	record(t, probe{tg.topo.name, tg.entry, name, method, p, r.status, r.body})
	if leaked(r.body) && !o.leakOK {
		t.Errorf("%s: canary leaked (status %d)", name, r.status)
	}
	return r
}

func (tg target) dsQuery(t *testing.T, name, cookie string, body []byte) reply {
	t.Helper()
	return tg.call(t, name, http.MethodPost, tg.path("/api/ds/query"), opts{cookie: cookie, contentType: jsonType, body: body})
}

// dsQueryOpen is dsQuery for callers that may legitimately see the canary.
func (tg target) dsQueryOpen(t *testing.T, name, cookie string, body []byte) reply {
	t.Helper()
	return tg.call(t, name, http.MethodPost, tg.path("/api/ds/query"), opts{cookie: cookie, contentType: jsonType, body: body, leakOK: true})
}

func wantStatus(t *testing.T, name string, r reply, codes ...int) {
	t.Helper()
	for _, c := range codes {
		if r.status == c {
			return
		}
	}
	t.Errorf("%s: status %d, want one of %v", name, r.status, codes)
}

func wantGate(t *testing.T, name string, r reply) {
	t.Helper()
	wantStatus(t, name, r, http.StatusForbidden)
	if got := answeredBy(r.body); got != "gate" {
		t.Errorf("%s: answered by %s, want gate", name, got)
	}
}

func requireJSONObject(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(body, &m); err != nil {
		t.Fatalf("response is not a JSON object: %v", err)
	}
	return m
}

// ---- saved queries ----

func moduleRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("go.mod not found above the working directory")
		}
		dir = parent
	}
}

func savedPanel(t *testing.T, file string, panelID int) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(moduleRoot(t), "..", "dashboards", file))
	if err != nil {
		t.Fatalf("read dashboard: %v", err)
	}
	var d struct {
		Panels []struct {
			ID      int `json:"id"`
			Targets []struct {
				RawSQL string `json:"rawSql"`
			} `json:"targets"`
		} `json:"panels"`
	}
	if err := json.Unmarshal(raw, &d); err != nil {
		t.Fatalf("parse dashboard: %v", err)
	}
	for _, p := range d.Panels {
		if p.ID == panelID && len(p.Targets) > 0 {
			return p.Targets[0].RawSQL
		}
	}
	t.Fatalf("panel %d not found in %s", panelID, file)
	return ""
}

var projectVar = regexp.MustCompile(`\$project\b`)

func sqlQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", "''") + "'" }

func interpolate(sql, login string, projects []string) string {
	sql = strings.ReplaceAll(sql, "${__user.login:sqlstring}", sqlQuote(login))
	quoted := make([]string, len(projects))
	for i, p := range projects {
		quoted[i] = sqlQuote(p)
	}
	list := strings.Join(quoted, ",")
	if list == "" {
		list = "''"
	}
	return projectVar.ReplaceAllLiteralString(sql, list)
}

func savedSQL(t *testing.T, panelID int, login string, projects []string) string {
	t.Helper()
	return interpolate(savedPanel(t, savedFile, panelID), login, projects)
}

var projectCache = struct {
	mu sync.Mutex
	m  map[string][]string
}{m: map[string][]string{}}

func projectsOf(t *testing.T, login string) []string {
	t.Helper()
	projectCache.mu.Lock()
	defer projectCache.mu.Unlock()
	if p, ok := projectCache.m[login]; ok {
		return p
	}
	top, err := exec.Command("git", "rev-parse", "--show-toplevel").Output()
	if err != nil {
		t.Fatalf("git rev-parse: %v", err)
	}
	q := "SELECT project_name FROM user_project_mapping WHERE user_login = " + sqlQuote(login)
	cmd := exec.Command("docker", "compose", "-f", "docker-compose-dev.yml", "exec", "-T", "mysql",
		"mysql", "-uroot", "-padmin", "lake", "-N", "-e", q)
	cmd.Dir = strings.TrimSpace(string(top))
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("read user_project_mapping for %s: %v", login, err)
	}
	projects := []string{}
	for _, l := range strings.Split(string(out), "\n") {
		if l = strings.TrimSpace(l); l != "" {
			projects = append(projects, l)
		}
	}
	projectCache.m[login] = projects
	return projects
}

func needProjects(t *testing.T, login string) []string {
	t.Helper()
	p := projectsOf(t, login)
	if len(p) == 0 {
		t.Fatalf("prerequisite: %s needs rows in user_project_mapping in the local lake DB", login)
	}
	return p
}

// ---- query bodies ----

var dsIDs = struct {
	mu sync.Mutex
	m  map[string]int64
}{m: map[string]int64{}}

func adminCall(t *testing.T, tp topology, method, p string, body any) reply {
	t.Helper()
	a := loadUsers(t).admin
	o := opts{basicUser: a.login, basicPass: a.password, contentType: jsonType}
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		o.body = raw
	}
	return do(t, method, tp.adminBase()+p, o)
}

func dsID(t *testing.T, tp topology, uid string) int64 {
	t.Helper()
	key := tp.name + "|" + uid
	dsIDs.mu.Lock()
	defer dsIDs.mu.Unlock()
	if id, ok := dsIDs.m[key]; ok {
		return id
	}
	r := adminCall(t, tp, http.MethodGet, "/api/datasources/uid/"+uid, nil)
	if r.status != http.StatusOK {
		t.Fatalf("datasource %s on %s: status %d", uid, tp.name, r.status)
	}
	id := int64(requireJSONObject(t, r.body)["id"].(float64))
	dsIDs.m[key] = id
	return id
}

func jsonStr(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

func mysqlDS(uid string) string {
	return `"datasource":{"type":"mysql","uid":` + jsonStr(uid) + `}`
}

func stdRest(sqlFragment string, id int64) string {
	return sqlFragment + `,"format":"table","datasourceId":` + strconv.FormatInt(id, 10) + `,"intervalMs":60000,"maxDataPoints":500`
}

func queryObj(refID, ds, rest string) string {
	return `{"refId":` + jsonStr(refID) + `,` + ds + `,` + rest + `}`
}

func wrapQueries(queries ...string) []byte {
	now := time.Now()
	from := strconv.FormatInt(now.AddDate(-10, 0, 0).UnixMilli(), 10)
	to := strconv.FormatInt(now.UnixMilli(), 10)
	return []byte(`{"queries":[` + strings.Join(queries, ",") + `],"from":"` + from + `","to":"` + to + `"}`)
}

func rawSQLField(sql string) string { return `"rawSql":` + jsonStr(sql) }

func queryBody(t *testing.T, tp topology, uid, sql string) []byte {
	t.Helper()
	return wrapQueries(queryObj("A", mysqlDS(uid), stdRest(rawSQLField(sql), dsID(t, tp, uid))))
}

func frameColumn(body []byte, refID, column string) []string {
	var d struct {
		Results map[string]struct {
			Frames []struct {
				Schema struct {
					Fields []struct {
						Name string `json:"name"`
					} `json:"fields"`
				} `json:"schema"`
				Data struct {
					Values [][]any `json:"values"`
				} `json:"data"`
			} `json:"frames"`
		} `json:"results"`
	}
	out := []string{}
	if json.Unmarshal(body, &d) != nil {
		return out
	}
	for _, f := range d.Results[refID].Frames {
		for i, fld := range f.Schema.Fields {
			if fld.Name != column || i >= len(f.Data.Values) {
				continue
			}
			for _, v := range f.Data.Values[i] {
				out = append(out, fmt.Sprint(v))
			}
		}
	}
	return out
}

func hasFrames(body []byte, refID string) bool {
	var d struct {
		Results map[string]struct {
			Frames []json.RawMessage `json:"frames"`
		} `json:"results"`
	}
	return json.Unmarshal(body, &d) == nil && len(d.Results[refID].Frames) > 0
}

func subset(got, allowed []string) bool {
	set := map[string]bool{}
	for _, a := range allowed {
		set[a] = true
	}
	for _, g := range got {
		if !set[g] {
			return false
		}
	}
	return true
}

// ---- timing and modes ----

func poll(t *testing.T, timeout, interval time.Duration, fn func() bool) time.Duration {
	t.Helper()
	start := time.Now()
	for {
		if fn() {
			return time.Since(start)
		}
		if time.Since(start) >= timeout {
			t.Fatalf("condition not met within %s", timeout)
		}
		time.Sleep(interval)
	}
}

func expectedMode() string {
	if m := os.Getenv("GV_EXPECT_MODE"); m != "" {
		return m
	}
	return "enforce"
}

func requireMode(t *testing.T, want string) {
	t.Helper()
	if got := expectedMode(); got != want {
		t.Skipf("needs gate mode %s, run is %s", want, got)
	}
}

func requirePhase(t *testing.T, want string) {
	t.Helper()
	if got := os.Getenv("GV_PHASE"); got != want {
		t.Skipf("needs GV_PHASE=%s", want)
	}
}

func randHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
