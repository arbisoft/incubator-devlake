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

package policy

import "testing"

func TestClassify(t *testing.T) {
	tests := []struct {
		path, root string
		want       Class
	}{
		{"/api/ds/query", "", Query},
		{"/API/DS/QUERY", "", Query},
		{"/api/ds/query/", "", Query},
		{"//api/ds/query", "", Query},
		{"/api/./ds/query", "", Query},
		{"/api/ds/../ds/query", "", Query},
		{"/api/ds/query", "/grafana", Query},
		{"/grafana/api/ds/query", "/grafana", Query},
		{"/GRAFANA/api/ds/query/", "/grafana", Query},
		{"/grafana/api/datasources/proxy/uid/x/q", "/grafana", AdminOnly},
		{"/grafanax/api/ds/query", "/grafana", Pass},
		{"/api/ds/query/extra", "", Pass},
		{"/api/datasources/proxy/uid/abc/query", "", AdminOnly},
		{"/api/datasources/proxy/1/query", "", AdminOnly},
		{"/api/datasources/uid/abc/resources/x", "", AdminOnly},
		{"/api/datasources/1/resources", "", AdminOnly},
		{"/api/datasources/uid/abc", "", Pass},
		{"/api/plugins/grafana-x/resources", "", AdminOnly},
		{"/api/plugins/grafana-x/resources/a/b", "", AdminOnly},
		{"/api/plugins/grafana-x/settings", "", Pass},
		{"/api/public/dashboards", "", AdminOnly},
		{"/api/public/dashboards/abc/panels/1/query", "", AdminOnly},
		{"/api/dashboards/uid/abc/public-dashboards", "", AdminOnly},
		{"/api/snapshots", "", AdminOnly},
		{"/api/snapshots/key", "", AdminOnly},
		{"/api/snapshot/shared-options", "", AdminOnly},
		{"/api/ruler/grafana/api/v1/rules", "", AdminOnly},
		{"/api/v1/eval", "", AdminOnly},
		{"/api/v1/rule/test/grafana", "", AdminOnly},
		{"/api/v1/provisioning/alert-rules", "", AdminOnly},
		{"/apis/query.grafana.app/v0alpha1/namespaces/default/query", "", AdminOnly},
		{"/apis/mysql.datasource.grafana.app/v0alpha1/x", "", AdminOnly},
		{"/apis/rules.alerting.grafana.app/v0alpha1/x", "", AdminOnly},
		{"/apis/snapshots.grafana.app/v0alpha1/x", "", AdminOnly},
		{"/apis/publicdashboards.grafana.app/v0alpha1/x", "", AdminOnly},
		{"/apis/dashboard.grafana.app/v1/namespaces/default/dashboards", "", Pass},
		{"/", "", Pass},
		{"/grafana", "/grafana", Pass},
		{"/d/abc/dash", "", Pass},
		{"/api/search", "", Pass},
		{"/api/user", "", Pass},
		{"/api/user/orgs", "", Pass},
		{"/api/live/ws", "", Pass},
		{"/api/health", "", Pass},
	}
	for _, tt := range tests {
		if got := Classify(tt.path, tt.root); got != tt.want {
			t.Errorf("Classify(%q, %q) = %d, want %d", tt.path, tt.root, got, tt.want)
		}
	}
}

func TestClassifyRequestReadsPublicDashboardSettings(t *testing.T) {
	tests := []struct {
		method, path, root string
		want               Class
	}{
		{"GET", "/api/dashboards/uid/abc/public-dashboards", "", Pass},
		{"HEAD", "/api/dashboards/uid/abc/public-dashboards", "", Pass},
		{"GET", "/grafana/api/dashboards/uid/abc/public-dashboards", "/grafana", Pass},
		{"GET", "/GRAFANA/API/dashboards/uid/abc/public-dashboards/", "/grafana", Pass},
		{"POST", "/api/dashboards/uid/abc/public-dashboards", "", AdminOnly},
		{"PATCH", "/api/dashboards/uid/abc/public-dashboards/x", "", AdminOnly},
		{"DELETE", "/api/dashboards/uid/abc/public-dashboards/x", "", AdminOnly},
		{"GET", "/api/dashboards/uid/abc/public-dashboards/x", "", AdminOnly},
		{"GET", "/api/public/dashboards/abc", "", AdminOnly},
		{"GET", "/api/public/dashboards/abc/panels/1/query", "", AdminOnly},
		{"GET", "/api/dashboards/public-dashboards", "", AdminOnly},
		{"POST", "/api/ds/query", "", Query},
		{"GET", "/api/datasources/proxy/uid/x/", "", AdminOnly},
	}
	for _, tt := range tests {
		if got := ClassifyRequest(tt.method, tt.path, tt.root); got != tt.want {
			t.Errorf("ClassifyRequest(%q, %q, %q) = %d, want %d", tt.method, tt.path, tt.root, got, tt.want)
		}
	}
}
