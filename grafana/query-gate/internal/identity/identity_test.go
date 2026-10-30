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

package identity

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type fakeGrafana struct {
	srv     *httptest.Server
	calls   atomic.Int32
	mu      sync.Mutex
	headers []http.Header
	user    string
	orgs    string
	status  int
	body    string
}

func newFake(t *testing.T, user, orgs string) *fakeGrafana {
	t.Helper()
	f := &fakeGrafana{user: user, orgs: orgs}
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.calls.Add(1)
		f.mu.Lock()
		f.headers = append(f.headers, r.Header.Clone())
		status, body := f.status, f.body
		f.mu.Unlock()
		if status != 0 {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Set-Cookie", "grafana_session=rotated")
			w.WriteHeader(status)
			_, _ = w.Write([]byte(body))
			return
		}
		switch r.URL.Path {
		case "/api/user":
			_, _ = w.Write([]byte(f.user))
		case "/api/user/orgs":
			_, _ = w.Write([]byte(f.orgs))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeGrafana) set(status int, body string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.status, f.body = status, body
}

func client(t *testing.T, f *fakeGrafana) *Client {
	t.Helper()
	u, err := url.Parse(f.srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	return New(u, "")
}

func TestLookupRoles(t *testing.T) {
	tests := []struct {
		name, user, orgs string
		want             Identity
	}{
		{"viewer", `{"login":"alice","email":"alice@example.test","orgId":1}`, `[{"orgId":1,"role":"Viewer"}]`, Identity{Login: "alice", Email: "alice@example.test", OrgID: 1}},
		{"org admin", `{"login":"bob","email":"bob@example.test","orgId":2}`, `[{"orgId":1,"role":"Viewer"},{"orgId":2,"role":"Admin"}]`, Identity{Login: "bob", Email: "bob@example.test", OrgID: 2, OrgAdmin: true}},
		{"admin of another org only", `{"login":"carol","orgId":1}`, `[{"orgId":1,"role":"Editor"},{"orgId":2,"role":"Admin"}]`, Identity{Login: "carol", OrgID: 1}},
		{"server admin", `{"login":"root","email":"root@example.test","orgId":1,"isGrafanaAdmin":true}`, `[{"orgId":1,"role":"Viewer"}]`, Identity{Login: "root", Email: "root@example.test", OrgID: 1, ServerAdmin: true}},
		{"server admin and org admin", `{"login":"boss","orgId":1,"isGrafanaAdmin":true}`, `[{"orgId":1,"role":"Admin"}]`, Identity{Login: "boss", OrgID: 1, ServerAdmin: true, OrgAdmin: true}},
		{"missing org", `{"login":"dave","orgId":3}`, `[{"orgId":1,"role":"Admin"}]`, Identity{Login: "dave", OrgID: 3}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newFake(t, tt.user, tt.orgs)
			got, st, err := client(t, f).Lookup(context.Background(), "c=1", "")
			if err != nil || st != nil || got != tt.want {
				t.Fatalf("got %+v %v %v, want %+v", got, st, err, tt.want)
			}
		})
	}
}

func TestLookupRelaysUnauthorized(t *testing.T) {
	f := newFake(t, "", "")
	f.set(http.StatusUnauthorized, `{"message":"Unauthorized"}`)
	_, st, err := client(t, f).Lookup(context.Background(), "c=1", "")
	if err != nil || st == nil || st.Code != 401 || string(st.Body) != `{"message":"Unauthorized"}` || st.ContentType != "application/json" {
		t.Fatalf("got %+v %v", st, err)
	}
	f.set(http.StatusForbidden, `nope`)
	_, st, err = client(t, f).Lookup(context.Background(), "c=2", "")
	if err != nil || st == nil || st.Code != 403 {
		t.Fatalf("got %+v %v", st, err)
	}
}

func TestLookupErrors(t *testing.T) {
	f := newFake(t, `{"login":"a","orgId":1}`, `[]`)
	f.set(http.StatusInternalServerError, `boom`)
	c := client(t, f)
	if _, st, err := c.Lookup(context.Background(), "c=1", ""); err == nil || st != nil {
		t.Fatalf("500: got %+v %v", st, err)
	}
	f.set(http.StatusOK, `not json`)
	if _, st, err := c.Lookup(context.Background(), "c=1", ""); err == nil || st != nil {
		t.Fatalf("bad json: got %+v %v", st, err)
	}
	f.srv.Close()
	if _, st, err := c.Lookup(context.Background(), "c=1", ""); err == nil || st != nil {
		t.Fatalf("network: got %+v %v", st, err)
	}
}

func TestLookupCache(t *testing.T) {
	f := newFake(t, `{"login":"alice","orgId":1}`, `[{"orgId":1,"role":"Viewer"}]`)
	c := client(t, f)
	now := time.Unix(1000, 0)
	c.now = func() time.Time { return now }
	lookup := func(cookie, auth string) {
		t.Helper()
		if _, _, err := c.Lookup(context.Background(), cookie, auth); err != nil {
			t.Fatal(err)
		}
	}
	lookup("c=1", "")
	lookup("c=1", "")
	if f.calls.Load() != 2 {
		t.Fatalf("upstream calls = %d, want 2 (one lookup)", f.calls.Load())
	}
	lookup("c=2", "")
	lookup("", "Bearer x")
	if f.calls.Load() != 6 {
		t.Fatalf("upstream calls = %d, want 6 (separate entries per credential)", f.calls.Load())
	}
	now = now.Add(14 * time.Second)
	lookup("c=1", "")
	if f.calls.Load() != 6 {
		t.Fatalf("expired too early: %d calls", f.calls.Load())
	}
	now = now.Add(2 * time.Second)
	lookup("c=1", "")
	if f.calls.Load() != 8 {
		t.Fatalf("not refreshed after the TTL: %d calls", f.calls.Load())
	}
}

func TestLookupFailuresAreNotCached(t *testing.T) {
	f := newFake(t, `{"login":"alice","orgId":1}`, `[]`)
	c := client(t, f)
	f.set(http.StatusUnauthorized, `{}`)
	_, _, _ = c.Lookup(context.Background(), "c=1", "")
	f.set(http.StatusInternalServerError, ``)
	_, _, _ = c.Lookup(context.Background(), "c=1", "")
	f.set(0, "")
	id, st, err := c.Lookup(context.Background(), "c=1", "")
	if err != nil || st != nil || id.Login != "alice" {
		t.Fatalf("got %+v %+v %v", id, st, err)
	}
}

func TestLookupCacheIsBounded(t *testing.T) {
	c := New(&url.URL{Scheme: "http", Host: "x"}, "")
	now := time.Unix(1000, 0)
	c.now = func() time.Time { return now }
	for i := 0; i < maxCacheSize; i++ {
		c.store(fmt.Sprintf("old-%d", i), Identity{})
	}
	now = now.Add(time.Minute)
	c.store("fresh", Identity{})
	if len(c.cache) != 1 {
		t.Fatalf("expired entries kept: %d", len(c.cache))
	}
	for i := 0; i < maxCacheSize+5; i++ {
		c.store(fmt.Sprintf("new-%d", i), Identity{})
	}
	if len(c.cache) > maxCacheSize {
		t.Fatalf("cache grew to %d", len(c.cache))
	}
}

func TestLookupForwardsOnlyCredentials(t *testing.T) {
	f := newFake(t, `{"login":"alice","orgId":1}`, `[]`)
	if _, _, err := client(t, f).Lookup(context.Background(), "grafana_session=abc", "Bearer tok"); err != nil {
		t.Fatal(err)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.headers) != 2 {
		t.Fatalf("requests = %d", len(f.headers))
	}
	for _, h := range f.headers {
		if h.Get("Cookie") != "grafana_session=abc" || h.Get("Authorization") != "Bearer tok" {
			t.Fatalf("credentials not forwarded: %v", h)
		}
		for name := range h {
			switch name {
			case "Cookie", "Authorization", "User-Agent", "Accept-Encoding":
			default:
				t.Fatalf("unexpected header %s", name)
			}
		}
	}
}
