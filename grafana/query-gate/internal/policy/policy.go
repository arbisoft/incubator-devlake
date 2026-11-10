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

// Class is how the gate treats a request path; a higher value is stricter.
type Class int

const (
	// Pass is forwarded without inspection.
	Pass Class = iota
	// SelfUpdate is a profile update whose login and email must not change.
	SelfUpdate
	// Query is a datasource query that non-admins may send only when it matches a saved query.
	Query
	// AdminOnly is reserved for admins.
	AdminOnly
)

var adminPrefixes = []string{
	"/api/datasources/proxy/",
	"/api/public/dashboards",
	"/api/snapshots",
	"/api/snapshots-delete/",
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

// forms lists the lower-cased cleaned and uncleaned paths, plus every suffix from an /api/ or /apis/ segment.
func forms(p, root string) []string {
	p = stripRoot(p, root)
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	var out []string
	seen := map[string]bool{}
	add := func(f string) {
		if !seen[f] {
			seen[f] = true
			out = append(out, f)
		}
	}
	for _, base := range []string{strings.ToLower(path.Clean(p)), strings.ToLower(p)} {
		add(base)
		for k := 1; k < len(base); k++ {
			if strings.HasPrefix(base[k:], "/api/") || strings.HasPrefix(base[k:], "/apis/") {
				add(base[k:])
			}
		}
	}
	return out
}

// classifyOne classifies one lower-cased path.
func classifyOne(p string) Class {
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

// Classify returns the strictest class over the path forms Grafana's router might match.
func Classify(p, root string) Class {
	c := Pass
	for _, f := range forms(p, root) {
		c = max(c, classifyOne(f))
	}
	return c
}

var dashboardPublicConfigRe = regexp.MustCompile(`^/api/dashboards/uid/[^/]+/public-dashboards$`)

func isCanonical(p, root string) bool {
	r := stripRoot(p, root)
	if !strings.HasPrefix(r, "/") {
		return false
	}
	c := path.Clean(r)
	return r == c || r == c+"/"
}

// ClassifyRequest is Classify over the decoded and escaped paths, with the method-specific rules applied.
func ClassifyRequest(method, p, escaped, root string) Class {
	c := max(Classify(p, root), Classify(escaped, root))
	if method == http.MethodPut {
		for _, f := range append(forms(p, root), forms(escaped, root)...) {
			if f == "/api/user" || f == "/api/user/" {
				c = max(c, SelfUpdate)
			}
		}
	}
	if c == AdminOnly && (method == http.MethodGet || method == http.MethodHead) &&
		strings.EqualFold(escaped, p) && isCanonical(p, root) &&
		dashboardPublicConfigRe.MatchString(normalise(p, root)) {
		return Pass
	}
	return c
}

func adminGroup(g string) bool {
	return g == "query.grafana.app" || strings.HasSuffix(g, "datasource.grafana.app") ||
		strings.HasSuffix(g, "alerting.grafana.app") || strings.Contains(g, "snapshot") || strings.Contains(g, "publicdashboard")
}
