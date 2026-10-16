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

package service

import (
	"net/url"
	"strings"

	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
)

// repositoryURLAttribute is the session's origin remote, sent on every metric and event
// under OTEL_METRICS_INCLUDE_REPOSITORY.
const repositoryURLAttribute = "vcs.repository.url.full"

// repositoryURLSchemes maps the remote schemes kept to the scheme stored. SSH and git
// remotes name the same repository as its https URL, which is what repos.url holds.
var repositoryURLSchemes = map[string]string{
	"https":   "https",
	"http":    "http",
	"ssh":     "https",
	"git":     "https",
	"git+ssh": "https",
}

// normalizeRepositoryURL returns a remote URL in the form repos.url uses, lowercased, so
// LOWER(repos.url) matches it. It drops any user info, port of an SSH remote, query,
// fragment, trailing slash and .git suffix, and rewrites SSH and scp-like remotes
// (git@host:org/repo.git) to https. Claude Code is documented to strip credentials and
// lowercase the URL, but DevLake does not rely on the client for either. It reports false
// for a value that is not a remote repository URL.
func normalizeRepositoryURL(raw string) (string, bool) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", false
	}
	if !strings.Contains(value, "://") {
		scpURL, ok := scpRemoteURL(value)
		if !ok {
			return "", false
		}
		value = scpURL
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Opaque != "" || parsed.Hostname() == "" {
		return "", false
	}
	scheme, supported := repositoryURLSchemes[strings.ToLower(parsed.Scheme)]
	if !supported {
		return "", false
	}
	host := parsed.Host
	if scheme != strings.ToLower(parsed.Scheme) {
		// The port of an SSH remote is not the port of its https URL.
		host = parsed.Hostname()
	}
	path := strings.TrimSuffix(strings.TrimSuffix(parsed.Path, "/"), ".git")
	if strings.Trim(path, "/") == "" {
		return "", false
	}
	normalized := url.URL{Scheme: scheme, Host: host, Path: path}
	return strings.ToLower(normalized.String()), true
}

// scpRemoteURL rewrites an scp-like remote, [user@]host:path, as an ssh URL. A value with
// no host before the colon, such as a local path, is not a remote.
func scpRemoteURL(value string) (string, bool) {
	hostPart, path, found := strings.Cut(value, ":")
	if !found {
		return "", false
	}
	if at := strings.LastIndex(hostPart, "@"); at >= 0 {
		hostPart = hostPart[at+1:]
	}
	if hostPart == "" || strings.ContainsAny(hostPart, "/\\") || strings.Contains(path, "\\") {
		return "", false
	}
	return "ssh://" + hostPart + "/" + strings.TrimPrefix(path, "/"), true
}

// normalizeRepositoryAttributes normalizes the repository URL attribute in place, so it is
// stored, hashed and converted only in its normalized form. A value that is not a remote
// repository URL is blanked: it may still carry credentials.
func normalizeRepositoryAttributes(attributes []*commonv1.KeyValue) {
	for _, attribute := range attributes {
		if attribute.GetKey() != repositoryURLAttribute {
			continue
		}
		normalized, _ := normalizeRepositoryURL(attribute.GetValue().GetStringValue())
		attribute.Value = &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: normalized}}
	}
}
