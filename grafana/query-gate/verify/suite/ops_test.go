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
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestHealthEndpoints(t *testing.T) {
	templates := map[string]float64{}
	for _, tp := range topologies {
		r := do(t, http.MethodGet, tp.gateOrigin()+"/gate/healthz", opts{})
		wantStatus(t, tp.name+" healthz", r, http.StatusOK)
		m := requireJSONObject(t, r.body)
		if m["mode"] != expectedMode() {
			t.Errorf("%s: mode %v, want %s", tp.name, m["mode"], expectedMode())
		}
		n, _ := m["templates"].(float64)
		if n < 558 {
			t.Errorf("%s: %v templates, want at least 558", tp.name, m["templates"])
		}
		templates[tp.name] = n
		wantStatus(t, tp.name+" readyz", do(t, http.MethodGet, tp.gateOrigin()+"/gate/readyz", opts{}), http.StatusOK)
	}
	if templates["staging"] != templates["prod"] {
		t.Errorf("template counts differ: %v", templates)
	}
}

func TestSlowQueryCompletes(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	eachEdge(t, func(t *testing.T, tg target) {
		t.Parallel()
		body := queryBody(t, tg.topo, mysqlUID, "SELECT SLEEP(25) AS s")
		start := time.Now()
		r := tg.dsQueryOpen(t, "sleep-25", tg.cookie(t, us.orgAdmin), body)
		took := time.Since(start)
		wantStatus(t, "sleep-25", r, http.StatusOK)
		if took < 25*time.Second || took > 34*time.Second {
			t.Errorf("slow query took %s, want 25s to 34s", took)
		}
	})
}

func TestLargeResponse(t *testing.T) {
	requireMode(t, "enforce")
	us := loadUsers(t)
	eachEdge(t, func(t *testing.T, tg target) {
		body := queryBody(t, tg.topo, mysqlUID, "SELECT REPEAT('x', 8000000) AS c")
		r := tg.dsQueryOpen(t, "repeat-8M", tg.cookie(t, us.orgAdmin), body)
		wantStatus(t, "repeat-8M", r, http.StatusOK)
		if len(r.body) <= 8000000 {
			t.Errorf("response is %d bytes, want more than 8000000", len(r.body))
		}
	})
}

// forwardsEverything checks the non-enforcing modes: the canary query and the saved query both reach Grafana.
func forwardsEverything(t *testing.T, mode string) {
	t.Helper()
	requireMode(t, mode)
	us := loadUsers(t)
	projA := needProjects(t, us.viewerA.login)
	eachEdge(t, func(t *testing.T, tg target) {
		cookie := tg.cookie(t, us.viewerA)
		r := tg.dsQueryOpen(t, mode+"-canary", cookie, queryBody(t, tg.topo, mysqlUID, canarySQL()))
		wantStatus(t, mode+"-canary", r, http.StatusOK)
		if !leaked(r.body) {
			t.Errorf("%s mode did not forward the canary query", mode)
		}
		saved := queryBody(t, tg.topo, mysqlUID, savedSQL(t, panelTasks, us.viewerA.login, projA))
		wantStatus(t, mode+"-saved", tg.dsQueryOpen(t, mode+"-saved", cookie, saved), http.StatusOK)
	})
}

func TestReportMode(t *testing.T) { forwardsEverything(t, "report") }

func TestOffMode(t *testing.T) { forwardsEverything(t, "off") }

func outageSessionFile(t *testing.T) string {
	t.Helper()
	return filepath.Join(workDir(t), "results", "outage-session")
}

func TestPrepareOutage(t *testing.T) {
	requirePhase(t, "prepare-outage")
	us := loadUsers(t)
	tg := edgeTarget(topologies[0])
	cookie := tg.cookie(t, us.viewerA)
	if err := os.MkdirAll(filepath.Dir(outageSessionFile(t)), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(outageSessionFile(t), []byte(cookie), 0o600); err != nil {
		t.Fatal(err)
	}
	// The body is built now because building it needs Grafana, which is down during the outage.
	projA := needProjects(t, us.viewerA.login)
	body := queryBody(t, tg.topo, mysqlUID, savedSQL(t, panelTasks, us.viewerA.login, projA))
	if err := os.WriteFile(outageSessionFile(t)+".body", body, 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestUpstreamDown(t *testing.T) {
	requirePhase(t, "outage")
	tg := edgeTarget(topologies[0])
	origin := tg.topo.gateOrigin()
	wantStatus(t, "healthz", do(t, http.MethodGet, origin+"/gate/healthz", opts{}), http.StatusOK)
	wantStatus(t, "readyz", do(t, http.MethodGet, origin+"/gate/readyz", opts{}), http.StatusServiceUnavailable)
	raw, err := os.ReadFile(outageSessionFile(t))
	if err != nil {
		t.Fatalf("read outage session (run TestPrepareOutage first): %v", err)
	}
	body, err := os.ReadFile(outageSessionFile(t) + ".body")
	if err != nil {
		t.Fatalf("read outage body (run TestPrepareOutage first): %v", err)
	}
	r := tg.dsQuery(t, "saved-during-outage", strings.TrimSpace(string(raw)), body)
	wantStatus(t, "saved-during-outage", r, http.StatusBadGateway)
	if _, ok := requireJSONObject(t, r.body)["message"].(string); !ok {
		t.Errorf("502 body has no JSON message: %q", r.body)
	}
	for _, bad := range []string{"goroutine", "panic", "dial tcp", ".go:", "/usr/", "/src/"} {
		if strings.Contains(string(r.body), bad) {
			t.Errorf("502 body contains %q", bad)
		}
	}
	wantStatus(t, "health-pass-through", tg.call(t, "health", http.MethodGet, tg.path("/api/health"), opts{}), http.StatusBadGateway)
}

func TestUpstreamRecovered(t *testing.T) {
	requirePhase(t, "recovered")
	us := loadUsers(t)
	tg := edgeTarget(topologies[0])
	client(t)
	poll(t, 90*time.Second, 2*time.Second, func() bool {
		r, err := send(http.MethodGet, tg.topo.gateOrigin()+"/gate/readyz", opts{})
		return err == nil && r.status == http.StatusOK
	})
	cookie := freshSession(t, tg.topo, tg.base, us.viewerA)
	body := queryBody(t, tg.topo, mysqlUID, savedSQL(t, panelTasks, us.viewerA.login, needProjects(t, us.viewerA.login)))
	wantStatus(t, "saved-after-recovery", tg.dsQuery(t, "saved-after-recovery", cookie, body), http.StatusOK)
}
