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

// Package identity asks Grafana who a request's credentials belong to.
package identity

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"
)

const (
	cacheTTL     = 15 * time.Second
	maxCacheSize = 10000
	maxBody      = 1 << 20
)

// Identity is the verified caller.
type Identity struct {
	Login, Email string
	OrgID        int64
	ServerAdmin  bool
	OrgAdmin     bool
}

// AdminFor reports whether the caller is an administrator for r; an org admin loses that when r names another org.
func (id Identity) AdminFor(r *http.Request) bool {
	if id.ServerAdmin {
		return true
	}
	if !id.OrgAdmin {
		return false
	}
	hinted := append(append([]string(nil), r.Header.Values("X-Grafana-Org-Id")...), r.URL.Query()["orgId"]...)
	for _, v := range hinted {
		if n, err := strconv.ParseInt(v, 10, 64); err != nil || n != id.OrgID {
			return false
		}
	}
	return true
}

// UpstreamStatus is a 401 or 403 answer from Grafana that the gate relays as-is.
type UpstreamStatus struct {
	Code        int
	Body        []byte
	ContentType string
}

type entry struct {
	id      Identity
	expires time.Time
}

// Client looks identities up in Grafana and caches successful answers briefly.
type Client struct {
	base string
	http *http.Client
	now  func() time.Time

	mu    sync.Mutex
	cache map[string]entry
}

// New returns a client for the Grafana at base, served under root.
func New(base *url.URL, root string) *Client {
	return &Client{
		base:  base.Scheme + "://" + base.Host + root,
		http:  &http.Client{Timeout: 5 * time.Second},
		now:   time.Now,
		cache: map[string]entry{},
	}
}

// Lookup returns the caller behind cookie and authorization, or Grafana's own 401/403 answer.
func (c *Client) Lookup(ctx context.Context, cookie, authorization string) (Identity, *UpstreamStatus, error) {
	sum := sha256.Sum256([]byte(cookie + "\x00" + authorization))
	key := hex.EncodeToString(sum[:])
	if id, ok := c.cached(key); ok {
		return id, nil, nil
	}
	var user struct {
		Login          string `json:"login"`
		Email          string `json:"email"`
		IsGrafanaAdmin bool   `json:"isGrafanaAdmin"`
		OrgID          int64  `json:"orgId"`
	}
	if st, err := c.get(ctx, "/api/user", cookie, authorization, &user); st != nil || err != nil {
		return Identity{}, st, err
	}
	var orgs []struct {
		OrgID int64  `json:"orgId"`
		Role  string `json:"role"`
	}
	if st, err := c.get(ctx, "/api/user/orgs", cookie, authorization, &orgs); st != nil || err != nil {
		return Identity{}, st, err
	}
	id := Identity{Login: user.Login, Email: user.Email, OrgID: user.OrgID, ServerAdmin: user.IsGrafanaAdmin}
	for _, o := range orgs {
		if o.OrgID == user.OrgID && o.Role == "Admin" {
			id.OrgAdmin = true
		}
	}
	c.store(key, id)
	return id, nil, nil
}

func (c *Client) get(ctx context.Context, p, cookie, authorization string, out any) (*UpstreamStatus, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+p, nil)
	if err != nil {
		return nil, fmt.Errorf("build identity request: %w", err)
	}
	if cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	if authorization != "" {
		req.Header.Set("Authorization", authorization)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("identity request failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBody))
	if err != nil {
		return nil, fmt.Errorf("read identity response: %w", err)
	}
	switch resp.StatusCode {
	case http.StatusOK:
		if err := json.Unmarshal(body, out); err != nil {
			return nil, fmt.Errorf("decode %s: %w", p, err)
		}
		return nil, nil
	case http.StatusUnauthorized, http.StatusForbidden:
		return &UpstreamStatus{Code: resp.StatusCode, Body: body, ContentType: resp.Header.Get("Content-Type")}, nil
	}
	return nil, fmt.Errorf("%s answered status %d", p, resp.StatusCode)
}

func (c *Client) cached(key string) (Identity, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.cache[key]
	if !ok || !c.now().Before(e.expires) {
		return Identity{}, false
	}
	return e.id, true
}

func (c *Client) store(key string, id Identity) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := c.now()
	if _, exists := c.cache[key]; !exists && len(c.cache) >= maxCacheSize {
		for k, e := range c.cache {
			if !now.Before(e.expires) {
				delete(c.cache, k)
			}
		}
		if len(c.cache) >= maxCacheSize {
			c.cache = map[string]entry{}
		}
	}
	c.cache[key] = entry{id: id, expires: now.Add(cacheTTL)}
}
