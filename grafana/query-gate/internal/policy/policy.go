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

// Package policy decides how the gate treats a request path.
package policy

import (
	"net/http"
	"path"
	"regexp"
	"strings"
)

// Class is how the gate treats a request path.
type Class int

const (
	// Pass is forwarded without inspection.
	Pass Class = iota
	// Query is a datasource query that non-admins may send only when it matches a saved query.
	Query
	// AdminOnly is reserved for admins.
	AdminOnly
)

var adminPrefixes = []string{
	"/api/datasources/proxy/",
	"/api/public/dashboards",
	"/api/snapshots",
	"/api/snapshot/",
	"/api/ruler",
	"/api/v1/rule/",
	"/api/v1/provisioning/",
}

func hasPrefixPath(p, prefix string) bool {
	if strings.HasSuffix(prefix, "/") {
		return strings.HasPrefix(p, prefix)
	}
	return p == prefix || strings.HasPrefix(p, prefix+"/")
}

func hasSegment(p, seg string) bool {
	for _, s := range strings.Split(p, "/") {
		if s == seg {
			return true
		}
	}
	return false
}

func stripRoot(p, root string) string {
	if root == "" {
		return p
	}
	lp, lr := strings.ToLower(p), strings.ToLower(root)
	if lp == lr {
		return ""
	}
	if strings.HasPrefix(lp, lr+"/") {
		return p[len(root):]
	}
	return p
}

func normalise(p, root string) string {
	p = stripRoot(p, root)
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	return strings.ToLower(path.Clean(p))
}

// Classify normalises the decoded request path and says how the gate treats it.
func Classify(p, root string) Class {
	p = normalise(p, root)
	switch {
	case p == "/api/ds/query":
		return Query
	case p == "/api/v1/eval":
		return AdminOnly
	case strings.HasPrefix(p, "/api/datasources/") && hasSegment(p, "resources"):
		return AdminOnly
	case strings.HasPrefix(p, "/api/plugins/") && hasSegment(p, "resources"):
		return AdminOnly
	case hasSegment(p, "public-dashboards"):
		return AdminOnly
	case strings.HasPrefix(p, "/apis/") && adminGroup(strings.SplitN(p[len("/apis/"):], "/", 2)[0]):
		return AdminOnly
	}
	for _, prefix := range adminPrefixes {
		if hasPrefixPath(p, prefix) {
			return AdminOnly
		}
	}
	return Pass
}

var dashboardPublicConfigRe = regexp.MustCompile(`^/api/dashboards/uid/[^/]+/public-dashboards$`)

// ClassifyRequest is Classify, except that reading a dashboard's public-dashboard settings passes, as the dashboard page does.
func ClassifyRequest(method, p, root string) Class {
	c := Classify(p, root)
	if c == AdminOnly && (method == http.MethodGet || method == http.MethodHead) &&
		dashboardPublicConfigRe.MatchString(normalise(p, root)) {
		return Pass
	}
	return c
}

func adminGroup(g string) bool {
	return g == "query.grafana.app" || strings.HasSuffix(g, "datasource.grafana.app") ||
		strings.HasSuffix(g, "alerting.grafana.app") || strings.Contains(g, "snapshot") || strings.Contains(g, "publicdashboard")
}
