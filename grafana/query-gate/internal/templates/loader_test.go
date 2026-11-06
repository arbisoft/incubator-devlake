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

package templates

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

const nestedDashboard = `{
  "title": "Nested",
  "templating": {"list": [
    {"name": "q1", "type": "query", "query": "SELECT a FROM v1"},
    {"name": "q2", "type": "query", "query": {"rawSql": "SELECT b FROM v2"}},
    {"name": "q3", "type": "query", "query": {"query": "SELECT c FROM v3"}},
    {"name": "q4", "type": "query", "query": ""},
    {"name": "c1", "type": "constant", "query": "SELECT not a template"},
    {"name": "t1", "type": "textbox", "query": "SELECT neither"}
  ]},
  "panels": [
    {"title": "Top", "targets": [{"refId": "A", "rawSql": "SELECT top"}, {"refId": "B", "rawSql": ""}, {"refId": "C"}]},
    {"type": "row", "title": "Row", "collapsed": true, "panels": [
      {"title": "Inner", "targets": [{"refId": "A", "rawSql": "SELECT inner1"}],
       "panels": [{"title": "Deep", "targets": [{"refId": "Z", "rawSql": "SELECT deep"}]}]}
    ]}
  ],
  "rows": [
    {"panels": [{"title": "Legacy", "targets": [{"refId": "L", "rawSql": "SELECT legacy"}]}]}
  ]
}`

func TestLoadDirWalksPanelsRowsAndVariables(t *testing.T) {
	dir := t.TempDir()
	sub := filepath.Join(dir, "sub")
	if err := os.MkdirAll(sub, 0o700); err != nil {
		t.Fatal(err)
	}
	files := map[string]string{
		"nested.json":             nestedDashboard,
		"sub/untitled.json":       `{"panels": [{"title": "P", "targets": [{"refId": "A", "rawSql": "SELECT u"}]}]}`,
		"sub/broken.json":         `{"title": `,
		"sub/not-a-dashboard.txt": `SELECT ignored`,
		"array.json":              `[1, 2]`,
	}
	for name, body := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	set, errs, err := LoadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"Nested :: Deep [Z]", "Nested :: Inner [A]", "Nested :: Legacy [L]", "Nested :: Top [A]",
		"Nested :: var q1", "Nested :: var q2", "Nested :: var q3", "untitled :: P [A]",
	}
	got := set.NoLogin()
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("locations\n got %q\nwant %q", got, want)
	}
	if set.Len() != len(want) {
		t.Fatalf("Len = %d, want %d", set.Len(), len(want))
	}
	var errLocs []string
	for _, e := range errs {
		errLocs = append(errLocs, filepath.ToSlash(e.Location))
	}
	sort.Strings(errLocs)
	if strings.Join(errLocs, "|") != "array.json|sub/broken.json" {
		t.Fatalf("compile errors = %v", errs)
	}
}

func TestLoadDirReportsTemplateCompileErrors(t *testing.T) {
	set, errs := loadJSON(t, map[string]string{"d.json": `{"title": "D", "panels": [{"title": "P", "targets": [
    {"refId": "A", "rawSql": "SELECT $__interval"}, {"refId": "B", "rawSql": "SELECT 1"}]}]}`})
	if set.Len() != 1 || len(errs) != 1 {
		t.Fatalf("Len = %d, errs = %v", set.Len(), errs)
	}
	if errs[0].Location != "D :: P [A]" || !strings.Contains(errs[0].Error(), "unsupported built-in") {
		t.Fatalf("error = %v", errs[0])
	}
}

func TestLoadDirMissingDirectory(t *testing.T) {
	if _, _, err := LoadDir(filepath.Join(t.TempDir(), "missing")); err == nil {
		t.Fatal("expected an error for a missing directory")
	}
}

const allProjectsDashboard = `{"title": "All", "tags": ["x", "devlake:all-projects"], "panels": [{"title": "P", "targets": [{"refId": "A", "rawSql": "SELECT 1"}]}]}`

const untaggedDashboard = `{"title": "Plain", "tags": ["devlake:all-projects-not"], "panels": [{"title": "P", "targets": [{"refId": "A", "rawSql": "SELECT 1"}]}]}`

func TestAllProjectsTagAcceptsNoLoginTemplate(t *testing.T) {
	tagged, errs := LoadDashboard([]byte(allProjectsDashboard), "db:a")
	if len(errs) != 0 {
		t.Fatal(errs)
	}
	plain, errs := LoadDashboard([]byte(untaggedDashboard), "db:b")
	if len(errs) != 0 {
		t.Fatal(errs)
	}
	if m := NewSet(tagged).Match("SELECT 1", Caller{Login: "alice"}); !m.Accepted || m.Location != "All :: P [A]" {
		t.Fatalf("tagged = %+v", m)
	}
	if m := NewSet(plain).Match("SELECT 1", Caller{Login: "alice"}); m.Accepted || m.Reason != ReasonNoLoginSlot {
		t.Fatalf("untagged = %+v", m)
	}
}

func TestNoLoginExcludesAllProjects(t *testing.T) {
	tagged, _ := LoadDashboard([]byte(allProjectsDashboard), "db:a")
	plain, _ := LoadDashboard([]byte(untaggedDashboard), "db:b")
	set := NewSet(tagged, plain)
	if set.Len() != 2 {
		t.Fatalf("Len = %d", set.Len())
	}
	got := set.NoLogin()
	if len(got) != 1 || got[0] != "Plain :: P [A]" {
		t.Fatalf("NoLogin = %q", got)
	}
}

func TestLoadDashboardFromBytes(t *testing.T) {
	ts, errs := LoadDashboard([]byte(`{"panels": [{"title": "P", "targets": [{"refId": "A", "rawSql": "SELECT $__interval"}, {"refId": "B", "rawSql": "SELECT 2"}]}]}`), "db:u1")
	if len(ts) != 1 || len(errs) != 1 || ts[0].Location != "db:u1 :: P [B]" {
		t.Fatalf("templates = %v, errs = %v", ts, errs)
	}
	ts, errs = LoadDashboard([]byte(`{"title": `), "db:u2")
	if len(ts) != 0 || len(errs) != 1 || errs[0].Location != "db:u2" {
		t.Fatalf("templates = %v, errs = %v", ts, errs)
	}
}
