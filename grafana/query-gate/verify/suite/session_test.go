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
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

func userID(t *testing.T, tp topology, login string) int64 {
	t.Helper()
	r := adminCall(t, tp, http.MethodGet, "/api/users/lookup?loginOrEmail="+url.QueryEscape(login), nil)
	if r.status != http.StatusOK {
		t.Fatalf("lookup of %s on %s: status %d", login, tp.name, r.status)
	}
	return int64(requireJSONObject(t, r.body)["id"].(float64))
}

func TestLogoutRevokes(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	projA := needProjects(t, us.viewerA.login)
	eachEdge(t, func(t *testing.T, tg target) {
		cookie := freshSession(t, tg.topo, tg.base, us.viewerA)
		body := queryBody(t, tg.topo, mysqlUID, savedSQL(t, panelTasks, us.viewerA.login, projA))
		wantStatus(t, "before-logout", tg.dsQuery(t, "before-logout", cookie, body), http.StatusOK)
		tg.call(t, "logout", http.MethodGet, tg.path("/logout"), opts{cookie: cookie})
		r := tg.dsQuery(t, "after-logout", cookie, body)
		if r.status == http.StatusOK {
			t.Errorf("after-logout: status 200, session still accepted")
		}
		if rows := frameColumn(r.body, "A", "Tasks Done"); len(rows) != 0 {
			t.Errorf("after-logout: rows returned %v", rows)
		}
	})
}

// revocationLifecycle takes the privilege away and back, timing how long each change takes to reach the gate.
func revocationLifecycle(t *testing.T, tg target, u user, apply func(id int64, granted bool) reply) {
	t.Helper()
	id := userID(t, tg.topo, u.login)
	cookie := tg.cookie(t, u)
	body := queryBody(t, tg.topo, mysqlUID, canarySQL())
	hasAccess := func() bool {
		r := tg.dsQueryOpen(t, "probe", cookie, body)
		return r.status == http.StatusOK && leaked(r.body)
	}
	if !hasAccess() {
		t.Fatalf("%s starts without canary access", u.login)
	}
	t.Cleanup(func() { apply(id, true) })
	wantStatus(t, "revoke", apply(id, false), http.StatusOK)
	d := poll(t, 25*time.Second, time.Second, func() bool { return !hasAccess() })
	t.Logf("revocation took %s", d)
	if d > 17*time.Second {
		t.Errorf("revocation took %s, want at most 17s", d)
	}
	wantStatus(t, "restore", apply(id, true), http.StatusOK)
	d = poll(t, 25*time.Second, time.Second, hasAccess)
	t.Logf("restoration took %s", d)
	if d > 17*time.Second {
		t.Errorf("restoration took %s, want at most 17s", d)
	}
}

func TestOrgAdminDemotion(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	eachEdge(t, func(t *testing.T, tg target) {
		revocationLifecycle(t, tg, us.orgAdmin, func(id int64, granted bool) reply {
			role := map[bool]string{true: "Admin", false: "Viewer"}[granted]
			return adminCall(t, tg.topo, http.MethodPatch, "/api/org/users/"+strconv.FormatInt(id, 10), map[string]string{"role": role})
		})
	})
}

func TestServerAdminRevocation(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	eachEdge(t, func(t *testing.T, tg target) {
		revocationLifecycle(t, tg, us.serverAdmin, func(id int64, granted bool) reply {
			return adminCall(t, tg.topo, http.MethodPut, "/api/admin/users/"+strconv.FormatInt(id, 10)+"/permissions", map[string]bool{"isGrafanaAdmin": granted})
		})
	})
}

func TestDeletedUserLosesAccess(t *testing.T) {
	requireMode(t, "enforce")
	eachEdge(t, func(t *testing.T, tg target) {
		temp := user{"gv-temp-" + randHex(4), "Gv1!" + randHex(12)}
		r := adminCall(t, tg.topo, http.MethodPost, "/api/admin/users", map[string]string{
			"name": temp.login, "login": temp.login, "email": temp.login + "@example.test", "password": temp.password,
		})
		wantStatus(t, "create user", r, http.StatusOK)
		id := strconv.FormatInt(int64(requireJSONObject(t, r.body)["id"].(float64)), 10)
		t.Cleanup(func() { adminCall(t, tg.topo, http.MethodDelete, "/api/admin/users/"+id, nil) })
		cookie := freshSession(t, tg.topo, tg.base, temp)
		body := queryBody(t, tg.topo, mysqlUID, savedSQL(t, panelTasks, temp.login, nil))
		wantStatus(t, "before-delete", tg.dsQuery(t, "before-delete", cookie, body), http.StatusOK)
		wantStatus(t, "delete user", adminCall(t, tg.topo, http.MethodDelete, "/api/admin/users/"+id, nil), http.StatusOK)
		d := poll(t, 2*time.Second, 100*time.Millisecond, func() bool {
			return tg.dsQuery(t, "after-delete", cookie, body).status != http.StatusOK
		})
		t.Logf("deleted user lost access after %s", d)
	})
}

func TestConcurrentViewers(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	projA, projB := needProjects(t, us.viewerA.login), needProjects(t, us.viewerB.login)
	union := append(append([]string{}, projA...), projB...)
	eachEdge(t, func(t *testing.T, tg target) {
		type caller struct {
			name, cookie string
			body         []byte
			allowed      []string
		}
		callers := []caller{
			{"A", tg.cookie(t, us.viewerA), queryBody(t, tg.topo, mysqlUID, savedSQL(t, panelCover, us.viewerA.login, union)), projA},
			{"B", tg.cookie(t, us.viewerB), queryBody(t, tg.topo, mysqlUID, savedSQL(t, panelCover, us.viewerB.login, union)), projB},
		}
		var wg sync.WaitGroup
		for i := 0; i < 64; i++ {
			c := callers[i%2]
			wg.Add(1)
			go func() {
				defer wg.Done()
				r, err := sendRefreshing(t, http.MethodPost, tg.origin+tg.path("/api/ds/query"), opts{cookie: c.cookie, contentType: jsonType, body: c.body})
				if err != nil {
					t.Errorf("viewer %s: %v", c.name, err)
					return
				}
				if r.status != http.StatusOK {
					t.Errorf("viewer %s: status %d", c.name, r.status)
					return
				}
				if got := frameColumn(r.body, "A", "Project"); !subset(got, c.allowed) {
					t.Errorf("viewer %s: Project values %v not within %v", c.name, got, c.allowed)
				}
			}()
		}
		wg.Wait()
	})
}

// ---- WebSocket (stdlib only) ----

type wsConn struct {
	conn io.ReadWriteCloser
	br   *bufio.Reader
	set  func(time.Time)
}

func wsDial(t *testing.T, tg target, cookie string) (*wsConn, *http.Response) {
	t.Helper()
	client(t)
	envState.mu.Lock()
	conf := envState.tlsConf
	envState.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	conn, host, err := dialOrigin(ctx, tg.origin, conf)
	if err != nil {
		t.Fatalf("websocket dial: %v", err)
	}
	key := make([]byte, 16)
	_, _ = rand.Read(key)
	req := fmt.Sprintf("GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\nOrigin: %s\r\nCookie: %s\r\n\r\n",
		tg.path("/api/live/ws"), host, base64.StdEncoding.EncodeToString(key), tg.origin, cookie)
	if _, err := io.WriteString(conn, req); err != nil {
		t.Fatalf("websocket handshake write: %v", err)
	}
	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, &http.Request{Method: http.MethodGet})
	if err != nil {
		t.Fatalf("websocket handshake read: %v", err)
	}
	return &wsConn{conn: conn, br: br, set: func(d time.Time) { _ = conn.SetDeadline(d) }}, resp
}

func (w *wsConn) write(op byte, payload []byte) error {
	hdr := []byte{0x80 | op}
	switch n := len(payload); {
	case n < 126:
		hdr = append(hdr, 0x80|byte(n))
	case n < 1<<16:
		hdr = append(hdr, 0x80|126, byte(n>>8), byte(n))
	default:
		hdr = append(hdr, 0x80|127)
		hdr = binary.BigEndian.AppendUint64(hdr, uint64(n))
	}
	mask := make([]byte, 4)
	_, _ = rand.Read(mask)
	masked := make([]byte, len(payload))
	for i, b := range payload {
		masked[i] = b ^ mask[i%4]
	}
	_, err := w.conn.Write(append(append(hdr, mask...), masked...))
	return err
}

func (w *wsConn) read() (byte, []byte, error) {
	var h [2]byte
	if _, err := io.ReadFull(w.br, h[:]); err != nil {
		return 0, nil, err
	}
	n := uint64(h[1] & 0x7f)
	switch n {
	case 126:
		var e [2]byte
		if _, err := io.ReadFull(w.br, e[:]); err != nil {
			return 0, nil, err
		}
		n = uint64(binary.BigEndian.Uint16(e[:]))
	case 127:
		var e [8]byte
		if _, err := io.ReadFull(w.br, e[:]); err != nil {
			return 0, nil, err
		}
		n = binary.BigEndian.Uint64(e[:])
	}
	payload := make([]byte, n)
	if _, err := io.ReadFull(w.br, payload); err != nil {
		return 0, nil, err
	}
	return h[0] & 0x0f, payload, nil
}

// readText returns text frames until the deadline passes or stop reports true.
func (w *wsConn) readText(d time.Duration, stop func(frames []string) bool) []string {
	var frames []string
	w.set(time.Now().Add(d))
	for !stop(frames) {
		op, p, err := w.read()
		if err != nil {
			break
		}
		switch op {
		case 1:
			frames = append(frames, string(p))
		case 9:
			_ = w.write(10, p)
		case 8:
			return frames
		}
	}
	return frames
}

func wsReplyFor(frames []string, id int) (map[string]json.RawMessage, bool) {
	for _, f := range frames {
		for _, line := range strings.Split(f, "\n") {
			var m map[string]json.RawMessage
			if json.Unmarshal([]byte(line), &m) != nil {
				continue
			}
			if got, ok := m["id"]; ok && string(got) == strconv.Itoa(id) {
				return m, true
			}
		}
	}
	return nil, false
}

func TestLiveWebsocket(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	eachEdge(t, func(t *testing.T, tg target) {
		cookie := tg.cookie(t, us.viewerA)
		ws, resp := wsDial(t, tg, cookie)
		if resp.StatusCode == http.StatusUnauthorized {
			ws.conn.Close()
			fresh, err := renew(t, cookie)
			if err != nil {
				t.Fatalf("renew session: %v", err)
			}
			ws, resp = wsDial(t, tg, fresh)
		}
		if resp.StatusCode != http.StatusSwitchingProtocols {
			t.Fatalf("websocket upgrade: status %d, want 101", resp.StatusCode)
		}
		defer ws.conn.Close()
		if err := ws.write(1, []byte(`{"id":1,"connect":{}}`)); err != nil {
			t.Fatalf("send connect: %v", err)
		}
		frames := ws.readText(10*time.Second, func(f []string) bool { _, ok := wsReplyFor(f, 1); return ok })
		m, ok := wsReplyFor(frames, 1)
		_, hasConnect := m["connect"]
		_, hasError := m["error"]
		if !ok || !hasConnect || hasError {
			t.Fatalf("connect reply differs from the expected shape; raw frames: %q", frames)
		}
		sub := `{"id":2,"subscribe":{"channel":"ds/devlake-mysql/gvsub"}}`
		if err := ws.write(1, []byte(sub)); err != nil {
			t.Fatalf("send subscribe: %v", err)
		}
		got := ws.readText(3*time.Second, func([]string) bool { return false })
		all := strings.Join(got, "\n")
		record(t, probe{tg.topo.name, tg.entry, "ws-subscribe", "WS", tg.path("/api/live/ws"), http.StatusSwitchingProtocols, []byte(all)})
		t.Logf("subscribe replies: %q", got)
		if strings.Contains(all, canary) {
			t.Error("a websocket frame contains the canary")
		}
	})
}
