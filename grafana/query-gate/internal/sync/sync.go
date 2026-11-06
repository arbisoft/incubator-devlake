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

// Package sync keeps the set of trusted saved queries in step with Grafana's dashboard database.
package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync/atomic"
	"time"

	"github.com/apache/incubator-devlake/grafana/query-gate/internal/templates"
)

// pageSize is a variable so tests can force user paging.
var pageSize = 1000

const (
	listLimit      = 500
	namespace      = "default"
	userPrefix     = "user:"
	requestTimeout = 10 * time.Second
	maxBody        = 64 << 20
)

type cached struct {
	generation int64
	saver      string
	templates  []*templates.Template
}

// Syncer rebuilds the trusted template set from dashboards last saved by an admin.
type Syncer struct {
	base     string
	user     string
	password string
	interval time.Duration
	shipped  []*templates.Template
	current  atomic.Pointer[templates.Set]
	logger   *slog.Logger
	http     *http.Client
	cache    map[string]*cached
	compiles int
}

// New returns a syncer; an empty user disables it.
func New(base *url.URL, root, user, password string, interval time.Duration, shipped []*templates.Template, logger *slog.Logger) *Syncer {
	s := &Syncer{
		base:     base.Scheme + "://" + base.Host + root,
		user:     user,
		password: password,
		interval: interval,
		shipped:  shipped,
		logger:   logger,
		http:     &http.Client{},
		cache:    map[string]*cached{},
	}
	s.current.Store(templates.NewSet(shipped))
	return s
}

// Current returns the shipped templates plus the trusted database dashboards.
func (s *Syncer) Current() *templates.Set { return s.current.Load() }

// Run syncs now and then every interval until ctx is done.
func (s *Syncer) Run(ctx context.Context) {
	if s.user == "" {
		s.logger.Info("dashboard sync disabled: no Grafana credentials configured")
		return
	}
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		if err := s.RunOnce(ctx); err != nil && ctx.Err() == nil {
			s.logger.Error("dashboard sync failed", "error", err.Error())
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// RunOnce performs one sync cycle and keeps the previous set when any step fails.
func (s *Syncer) RunOnce(ctx context.Context) error {
	if s.user == "" {
		return nil
	}
	admins, err := s.adminUIDs(ctx)
	if err != nil {
		return err
	}
	items, err := s.dashboards(ctx)
	if err != nil {
		return err
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Metadata.Name < items[j].Metadata.Name })
	seen := map[string]bool{}
	var trusted [][]*templates.Template
	for _, item := range items {
		seen[item.Metadata.Name] = true
		if ts := s.dashboardTemplates(item, admins); ts != nil {
			trusted = append(trusted, ts)
		}
	}
	for uid := range s.cache {
		if !seen[uid] {
			delete(s.cache, uid)
		}
	}
	s.current.Store(templates.NewSet(append([][]*templates.Template{s.shipped}, trusted...)...))
	return nil
}

type dashboardItem struct {
	Metadata struct {
		Name        string            `json:"name"`
		Generation  int64             `json:"generation"`
		Annotations map[string]string `json:"annotations"`
	} `json:"metadata"`
	Spec json.RawMessage `json:"spec"`
}

func saverOf(annotations map[string]string) string {
	if v := annotations["grafana.app/updatedBy"]; v != "" {
		return v
	}
	return annotations["grafana.app/createdBy"]
}

func (s *Syncer) dashboardTemplates(item dashboardItem, admins map[string]bool) []*templates.Template {
	uid := item.Metadata.Name
	saver := saverOf(item.Metadata.Annotations)
	if !strings.HasPrefix(saver, userPrefix) || !admins[strings.TrimPrefix(saver, userPrefix)] {
		delete(s.cache, uid)
		return nil
	}
	c := s.cache[uid]
	if c == nil || c.generation != item.Metadata.Generation || c.saver != saver {
		s.compiles++
		ts, errs := templates.LoadDashboard(item.Spec, "db:"+uid)
		for _, e := range errs {
			s.logger.Warn("dashboard skipped query", "dashboard_uid", uid, "generation", item.Metadata.Generation, "location", e.Location, "error", e.Message)
		}
		c = &cached{generation: item.Metadata.Generation, saver: saver, templates: ts}
		s.cache[uid] = c
	}
	return c.templates
}

func (s *Syncer) adminUIDs(ctx context.Context) (map[string]bool, error) {
	admins := map[string]bool{}
	for page, seen := 1, 0; ; page++ {
		var res struct {
			TotalCount int `json:"totalCount"`
			Users      []struct {
				UID     string `json:"uid"`
				IsAdmin bool   `json:"isAdmin"`
			} `json:"users"`
		}
		if err := s.get(ctx, fmt.Sprintf("/api/users/search?perpage=%d&page=%d", pageSize, page), &res); err != nil {
			return nil, err
		}
		for _, u := range res.Users {
			if u.IsAdmin {
				admins[u.UID] = true
			}
		}
		if seen += len(res.Users); len(res.Users) == 0 || seen >= res.TotalCount {
			break
		}
	}
	for page, seen := 1, 0; ; page++ {
		var res struct {
			TotalCount int `json:"totalCount"`
			OrgUsers   []struct {
				UID  string `json:"uid"`
				Role string `json:"role"`
			} `json:"orgUsers"`
		}
		if err := s.get(ctx, fmt.Sprintf("/api/org/users/search?perpage=%d&page=%d", pageSize, page), &res); err != nil {
			return nil, err
		}
		for _, u := range res.OrgUsers {
			if u.Role == "Admin" {
				admins[u.UID] = true
			}
		}
		if seen += len(res.OrgUsers); len(res.OrgUsers) == 0 || seen >= res.TotalCount {
			break
		}
	}
	return admins, nil
}

func (s *Syncer) dashboards(ctx context.Context) ([]dashboardItem, error) {
	var items []dashboardItem
	path := fmt.Sprintf("/apis/dashboard.grafana.app/v1beta1/namespaces/%s/dashboards?limit=%d", namespace, listLimit)
	next := ""
	for {
		var list struct {
			Metadata struct {
				Continue string `json:"continue"`
			} `json:"metadata"`
			Items []dashboardItem `json:"items"`
		}
		q := path
		if next != "" {
			q += "&continue=" + url.QueryEscape(next)
		}
		if err := s.get(ctx, q, &list); err != nil {
			return nil, err
		}
		items = append(items, list.Items...)
		if next = list.Metadata.Continue; next == "" {
			return items, nil
		}
	}
}

func (s *Syncer) get(ctx context.Context, p string, out any) error {
	ctx, cancel := context.WithTimeout(ctx, requestTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.base+p, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.SetBasicAuth(s.user, s.password)
	resp, err := s.http.Do(req)
	if err != nil {
		return fmt.Errorf("GET %s: %w", p, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: status %d", p, resp.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxBody)).Decode(out); err != nil {
		return fmt.Errorf("GET %s: decode: %w", p, err)
	}
	return nil
}
