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

// Package config reads the gate settings from environment variables.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"path"
	"regexp"
	"strings"
	"time"
)

// Mode says how the gate treats requests it would reject.
type Mode string

const (
	ModeOff     Mode = "off"
	ModeReport  Mode = "report"
	ModeEnforce Mode = "enforce"
)

var rootPathRe = regexp.MustCompile(`^(/[A-Za-z0-9._~-]+)+$`)

const minSyncInterval = 10 * time.Second

// Config is the validated gate configuration.
type Config struct {
	Mode          Mode
	Upstream      *url.URL
	Listen        string
	RootPath      string
	DashboardsDir string
	MySQLUIDs     map[string]bool
	GrafanaUser   string
	GrafanaPass   string
	SyncInterval  time.Duration
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

// Load validates the environment returned by getenv.
func Load(getenv func(string) string) (Config, error) {
	var c Config
	switch m := Mode(getenv("GATE_MODE")); m {
	case ModeOff, ModeReport, ModeEnforce:
		c.Mode = m
	default:
		return c, errors.New("GATE_MODE must be one of off, report, enforce")
	}
	raw := getenv("GATE_UPSTREAM")
	u, err := url.Parse(raw)
	if err != nil || raw == "" || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" ||
		(u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" || u.User != nil {
		return c, errors.New("GATE_UPSTREAM must be an absolute http or https URL without a path")
	}
	c.Upstream = u
	c.Listen = orDefault(getenv("GATE_LISTEN"), ":3001")
	c.RootPath = getenv("GATE_ROOT_PATH")
	if c.RootPath != "" && (!rootPathRe.MatchString(c.RootPath) || path.Clean(c.RootPath) != c.RootPath) {
		return c, errors.New("GATE_ROOT_PATH must be a clean absolute path like /grafana")
	}
	c.DashboardsDir = orDefault(getenv("GATE_DASHBOARDS_DIR"), "/etc/grafana/dashboards")
	c.MySQLUIDs = map[string]bool{}
	for _, uid := range strings.Split(orDefault(getenv("GATE_MYSQL_DS_UID"), "devlake-mysql"), ",") {
		if uid = strings.TrimSpace(uid); uid != "" {
			c.MySQLUIDs[uid] = true
		}
	}
	if len(c.MySQLUIDs) == 0 {
		return c, errors.New("GATE_MYSQL_DS_UID must name at least one datasource uid")
	}
	switch {
	case getenv("GATE_GRAFANA_USER") != "" || getenv("GATE_GRAFANA_PASSWORD") != "":
		c.GrafanaUser, c.GrafanaPass = getenv("GATE_GRAFANA_USER"), getenv("GATE_GRAFANA_PASSWORD")
		if c.GrafanaUser == "" || c.GrafanaPass == "" {
			return c, errors.New("GATE_GRAFANA_USER and GATE_GRAFANA_PASSWORD must be set together")
		}
	case getenv("GRAFANA_MANAGEMENT_USER") != "" || getenv("GRAFANA_MANAGEMENT_PASSWORD") != "":
		c.GrafanaUser, c.GrafanaPass = getenv("GRAFANA_MANAGEMENT_USER"), getenv("GRAFANA_MANAGEMENT_PASSWORD")
		if c.GrafanaUser == "" || c.GrafanaPass == "" {
			return c, errors.New("GRAFANA_MANAGEMENT_USER and GRAFANA_MANAGEMENT_PASSWORD must be set together")
		}
	}
	c.SyncInterval = time.Minute
	if v := getenv("GATE_SYNC_INTERVAL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return c, fmt.Errorf("GATE_SYNC_INTERVAL is not a duration: %w", err)
		}
		if d < minSyncInterval {
			return c, fmt.Errorf("GATE_SYNC_INTERVAL must be at least %s", minSyncInterval)
		}
		c.SyncInterval = d
	}
	return c, nil
}
