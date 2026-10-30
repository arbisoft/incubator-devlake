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

package config

import (
	"strings"
	"testing"
	"time"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoadConfig(t *testing.T) {
	base := func(extra map[string]string) map[string]string {
		m := map[string]string{"GATE_MODE": "enforce", "GATE_UPSTREAM": "http://grafana:3000"}
		for k, v := range extra {
			m[k] = v
		}
		return m
	}
	tests := []struct {
		name    string
		env     map[string]string
		wantErr string
		check   func(t *testing.T, c Config)
	}{
		{name: "defaults", env: base(nil), check: func(t *testing.T, c Config) {
			if c.Mode != ModeEnforce || c.Listen != ":3001" || c.RootPath != "" || c.DashboardsDir != "/etc/grafana/dashboards" ||
				!c.MySQLUIDs["devlake-mysql"] || len(c.MySQLUIDs) != 1 || c.SyncInterval != time.Minute || c.GrafanaUser != "" {
				t.Fatalf("unexpected defaults %+v", c)
			}
		}},
		{name: "all set", env: base(map[string]string{
			"GATE_MODE": "report", "GATE_UPSTREAM": "https://g.example/", "GATE_LISTEN": ":9", "GATE_ROOT_PATH": "/grafana",
			"GATE_DASHBOARDS_DIR": "/d", "GATE_MYSQL_DS_UID": " a, ,b ,", "GATE_GRAFANA_USER": "u", "GATE_GRAFANA_PASSWORD": "p",
			"GATE_SYNC_INTERVAL": "15s",
		}), check: func(t *testing.T, c Config) {
			if c.Mode != ModeReport || c.Listen != ":9" || c.RootPath != "/grafana" || !c.MySQLUIDs["a"] || !c.MySQLUIDs["b"] ||
				len(c.MySQLUIDs) != 2 || c.GrafanaUser != "u" || c.SyncInterval != 15*time.Second {
				t.Fatalf("unexpected %+v", c)
			}
		}},
		{name: "off mode", env: base(map[string]string{"GATE_MODE": "off"})},
		{name: "management fallback", env: base(map[string]string{"GRAFANA_MANAGEMENT_USER": "m", "GRAFANA_MANAGEMENT_PASSWORD": "s"}),
			check: func(t *testing.T, c Config) {
				if c.GrafanaUser != "m" || c.GrafanaPass != "s" {
					t.Fatalf("fallback not used %+v", c)
				}
			}},
		{name: "gate vars win over management", env: base(map[string]string{"GATE_GRAFANA_USER": "g", "GATE_GRAFANA_PASSWORD": "x",
			"GRAFANA_MANAGEMENT_USER": "m", "GRAFANA_MANAGEMENT_PASSWORD": "s"}),
			check: func(t *testing.T, c Config) {
				if c.GrafanaUser != "g" || c.GrafanaPass != "x" {
					t.Fatalf("unexpected %+v", c)
				}
			}},
		{name: "missing mode", env: map[string]string{"GATE_UPSTREAM": "http://g"}, wantErr: "GATE_MODE"},
		{name: "bad mode", env: base(map[string]string{"GATE_MODE": "on"}), wantErr: "GATE_MODE"},
		{name: "missing upstream", env: map[string]string{"GATE_MODE": "off"}, wantErr: "GATE_UPSTREAM"},
		{name: "relative upstream", env: base(map[string]string{"GATE_UPSTREAM": "grafana:3000"}), wantErr: "GATE_UPSTREAM"},
		{name: "ftp upstream", env: base(map[string]string{"GATE_UPSTREAM": "ftp://g"}), wantErr: "GATE_UPSTREAM"},
		{name: "upstream path", env: base(map[string]string{"GATE_UPSTREAM": "http://g/grafana"}), wantErr: "GATE_UPSTREAM"},
		{name: "root without slash", env: base(map[string]string{"GATE_ROOT_PATH": "grafana"}), wantErr: "GATE_ROOT_PATH"},
		{name: "root trailing slash", env: base(map[string]string{"GATE_ROOT_PATH": "/grafana/"}), wantErr: "GATE_ROOT_PATH"},
		{name: "no uids", env: base(map[string]string{"GATE_MYSQL_DS_UID": " , "}), wantErr: "GATE_MYSQL_DS_UID"},
		{name: "user without password", env: base(map[string]string{"GATE_GRAFANA_USER": "u"}), wantErr: "GATE_GRAFANA_PASSWORD"},
		{name: "password without user", env: base(map[string]string{"GATE_GRAFANA_PASSWORD": "hunter2"}), wantErr: "GATE_GRAFANA_USER"},
		{name: "interval not a duration", env: base(map[string]string{"GATE_SYNC_INTERVAL": "soon"}), wantErr: "GATE_SYNC_INTERVAL"},
		{name: "interval too short", env: base(map[string]string{"GATE_SYNC_INTERVAL": "9s"}), wantErr: "GATE_SYNC_INTERVAL"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, err := Load(env(tt.env))
			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("err = %v, want mention of %s", err, tt.wantErr)
				}
				if strings.Contains(err.Error(), "hunter2") {
					t.Fatalf("error echoes the password: %v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if tt.check != nil {
				tt.check(t, c)
			}
		})
	}
}
