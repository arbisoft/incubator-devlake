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
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func loadJSON(t *testing.T, dashboards map[string]string) (*Set, []CompileError) {
	t.Helper()
	dir := t.TempDir()
	for name, body := range dashboards {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	set, errs, err := LoadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	return set, errs
}

const attackDashboard = `{
  "title": "Attack",
  "templating": {"list": [{"name": "project", "type": "query", "multi": true, "includeAll": true, "query": "SELECT 1"}]},
  "panels": [{"title": "P", "targets": [
    {"refId": "A", "rawSql": "SELECT * FROM t WHERE project IN (${project:sqlstring}) AND owner = ${__user.login:sqlstring}"},
    {"refId": "B", "rawSql": "SELECT * FROM t WHERE project REGEXP '^(${project:regex})$' AND owner = ${__user.login:sqlstring}"}
  ]}]
}`

func TestMatchAttacks(t *testing.T) {
	set, errs := loadJSON(t, map[string]string{"attack.json": attackDashboard})
	if len(errs) != 0 {
		t.Fatalf("unexpected compile errors %v", errs)
	}
	if set.Len() != 3 {
		t.Fatalf("templates = %d, want 3", set.Len())
	}
	const prefix = "SELECT * FROM t WHERE project IN ("
	const regexPrefix = "SELECT * FROM t WHERE project REGEXP '^("
	tests := []struct {
		name   string
		sql    string
		accept bool
		reason Reason
	}{
		{"legit list", prefix + "'a','b') AND owner = 'alice'", true, ""},
		{"legit regex", regexPrefix + "(a|b))$' AND owner = 'alice'", true, ""},
		{"legit empty selection", prefix + ") AND owner = 'alice'", true, ""},
		{"unmapped project but own login", prefix + "'zzz') AND owner = 'alice'", true, ""},
		{"login swapped", prefix + "'a') AND owner = 'bob'", false, ReasonLoginMismatch},
		{"regex login swapped", regexPrefix + "a)$' AND owner = 'bob'", false, ReasonLoginMismatch},
		{"login with injection", prefix + "'a') AND owner = 'alice' OR '1'='1'", false, ReasonNoMatch},
		{"quote breakout", prefix + "'x') UNION SELECT login FROM users -- ') AND owner = 'alice'", false, ReasonNoMatch},
		{"backslash trick", prefix + `'x\') OR 1=1 -- ') AND owner = 'alice'`, false, ReasonNoMatch},
		{"free SQL", "SELECT * FROM users", false, ReasonNoMatch},
		{"free SQL with caller login", "SELECT * FROM users WHERE owner = 'alice'", false, ReasonNoMatch},
		{"appended union", prefix + "'a') AND owner = 'alice' UNION SELECT 1", false, ReasonNoMatch},
		{"regex value with quote", regexPrefix + "a'b)$' AND owner = 'alice'", false, ReasonNoMatch},
		{"regex value ending in lone backslash", regexPrefix + `abc\)$' AND owner = 'alice'`, false, ReasonNoMatch},
		{"regex breakout", regexPrefix + "x') OR 1=1 -- )$' AND owner = 'alice'", false, ReasonNoMatch},
		{"empty sql", "", false, ReasonNoMatch},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := set.Match(tc.sql, Caller{Login: "alice"})
			if got.Accepted != tc.accept {
				t.Fatalf("Accepted = %v, want %v (%+v)", got.Accepted, tc.accept, got)
			}
			if !tc.accept && got.Reason != tc.reason {
				t.Fatalf("Reason = %q, want %q", got.Reason, tc.reason)
			}
			if tc.accept && got.Location == "" {
				t.Fatal("accepted result has no location")
			}
		})
	}
}

func TestMatchAcceptedLocation(t *testing.T) {
	set, _ := loadJSON(t, map[string]string{"attack.json": attackDashboard})
	got := set.Match("SELECT * FROM t WHERE project REGEXP '^(a)$' AND owner = 'alice'", Caller{Login: "alice"})
	if want := "Attack :: P [B]"; !got.Accepted || got.Location != want {
		t.Fatalf("got %+v, want accepted at %q", got, want)
	}
}

func TestNoLogin(t *testing.T) {
	set, errs := loadJSON(t, map[string]string{"d.json": `{
  "title": "D",
  "panels": [{"title": "P", "targets": [
    {"refId": "B", "rawSql": "SELECT 1 FROM t WHERE x = 'fixed'"},
    {"refId": "A", "rawSql": "SELECT 2 FROM t"},
    {"refId": "C", "rawSql": "SELECT 3 FROM t WHERE o = ${__user.login:sqlstring}"}
  ]}]
}`})
	if len(errs) != 0 {
		t.Fatalf("unexpected errors %v", errs)
	}
	got := set.NoLogin()
	want := []string{"D :: P [A]", "D :: P [B]"}
	if fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("NoLogin = %v, want %v", got, want)
	}
	res := set.Match("SELECT 2 FROM t", Caller{Login: "alice"})
	if res.Accepted || res.Reason != ReasonNoLoginSlot || res.Location != "D :: P [A]" {
		t.Fatalf("no-login template result = %+v", res)
	}
	if res := set.Match("SELECT 3 FROM t WHERE o = 'alice'", Caller{Login: "alice"}); !res.Accepted || res.Location != "D :: P [C]" {
		t.Fatalf("login template result = %+v", res)
	}
}

func TestMatchRejectionPriority(t *testing.T) {
	set, errs := loadJSON(t, map[string]string{"d.json": `{
  "title": "D",
  "panels": [{"title": "P", "targets": [
    {"refId": "A", "rawSql": "SELECT 1 WHERE x = 'v'"},
    {"refId": "B", "rawSql": "SELECT 1 WHERE x = 'v'"},
    {"refId": "C", "rawSql": "SELECT 1 WHERE x = ${__user.login:sqlstring}"},
    {"refId": "D", "rawSql": "SELECT 1 WHERE x = ${__user.login:sqlstring}"}
  ]}]
}`})
	if len(errs) != 0 {
		t.Fatalf("unexpected errors %v", errs)
	}
	got := set.Match("SELECT 1 WHERE x = 'v'", Caller{Login: "alice"})
	if got.Accepted || got.Reason != ReasonLoginMismatch || got.Location != "D :: P [C]" {
		t.Fatalf("mismatch must beat missing login slot, first location kept: %+v", got)
	}
	if got := set.Match("SELECT 1 WHERE x = 'alice'", Caller{Login: "alice"}); !got.Accepted || got.Location != "D :: P [C]" {
		t.Fatalf("own login must be accepted: %+v", got)
	}
	if got := set.Match("SELECT 1 WHERE x = 'v'", Caller{Login: "v"}); !got.Accepted {
		t.Fatalf("login v must be accepted: %+v", got)
	}
}

func TestMatchQuotedLogin(t *testing.T) {
	set, _ := loadJSON(t, map[string]string{"d.json": `{"title": "D", "panels": [{"title": "P", "targets": [
    {"refId": "A", "rawSql": "SELECT 1 WHERE o = ${__user.login:sqlstring}"}]}]}`})
	if got := set.Match("SELECT 1 WHERE o = 'o''hara'", Caller{Login: "o'hara"}); !got.Accepted {
		t.Fatalf("quoted login rejected: %+v", got)
	}
	if got := set.Match("SELECT 1 WHERE o = 'o'", Caller{Login: "o'hara"}); got.Accepted {
		t.Fatalf("prefix of login accepted: %+v", got)
	}
}

func TestMatchEmailSlot(t *testing.T) {
	const tpl = "SELECT 1 FROM t WHERE owner = ${__user.login:sqlstring} ORDER BY e = ${__user.email:sqlstring}"
	set, errs := loadJSON(t, map[string]string{"d.json": `{"title": "D", "panels": [{"title": "P", "targets": [
    {"refId": "A", "rawSql": "` + tpl + `"},
    {"refId": "B", "rawSql": "SELECT 2 FROM t ORDER BY e = ${__user.email:sqlstring}"}]}]}`})
	if len(errs) != 0 {
		t.Fatalf("unexpected errors %v", errs)
	}
	const pre = "SELECT 1 FROM t WHERE owner = "
	alice := Caller{Login: "alice", Email: "alice@example.test"}
	tests := []struct {
		name   string
		sql    string
		caller Caller
		accept bool
		reason Reason
	}{
		{"right login and email", pre + "'alice' ORDER BY e = 'alice@example.test'", alice, true, ""},
		{"right login other email", pre + "'alice' ORDER BY e = 'mallory@example.test'", alice, false, ReasonEmailMismatch},
		{"other login right email", pre + "'mallory' ORDER BY e = 'alice@example.test'", alice, false, ReasonLoginMismatch},
		{"quoted email doubled", pre + "'o' ORDER BY e = 'o''neil@example.test'", Caller{Login: "o", Email: "o'neil@example.test"}, true, ""},
		{"quoted email undoubled", pre + "'o' ORDER BY e = 'o'neil@example.test'", Caller{Login: "o", Email: "o'neil@example.test"}, false, ReasonNoMatch},
		{"quoted email prefix", pre + "'o' ORDER BY e = 'o'", Caller{Login: "o", Email: "o'neil@example.test"}, false, ReasonEmailMismatch},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := set.Match(tc.sql, tc.caller)
			if got.Accepted != tc.accept || got.Reason != tc.reason {
				t.Fatalf("got %+v, want accepted=%v reason=%q", got, tc.accept, tc.reason)
			}
		})
	}
	if got := set.NoLogin(); fmt.Sprint(got) != "[D :: P [B]]" {
		t.Fatalf("NoLogin = %v", got)
	}
	res := set.Match("SELECT 2 FROM t ORDER BY e = 'alice@example.test'", alice)
	if res.Accepted || res.Reason != ReasonNoLoginSlot || res.Location != "D :: P [B]" {
		t.Fatalf("email-only template result = %+v", res)
	}
}

func BenchmarkMatch(b *testing.B) {
	set := &Set{}
	for n := 0; n < 500; n++ {
		sql := fmt.Sprintf("SELECT col%d, COUNT(*) FROM tbl%d WHERE project IN (${v:sqlstring}) AND owner = ${__user.login:sqlstring} GROUP BY 1", n, n)
		tpl, err := newTemplate(fmt.Sprintf("loc%d", n), sql, vmap(Variable{Name: "v", Type: "query", Multi: true, IncludeAll: true}))
		if err != nil {
			b.Fatal(err)
		}
		set.templates = append(set.templates, tpl)
	}
	sql := "SELECT col499, COUNT(*) FROM tbl499 WHERE project IN ('a','b','c') AND owner = 'alice' GROUP BY 1"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if !set.Match(sql, Caller{Login: "alice"}).Accepted {
			b.Fatal("not accepted")
		}
	}
}

func TestMatchEmptyMultiValueSelection(t *testing.T) {
	set, errs := loadJSON(t, map[string]string{"a.json": attackDashboard})
	if len(errs) != 0 {
		t.Fatal(errs)
	}
	alice := Caller{Login: "alice"}
	accepted := []string{
		"SELECT * FROM t WHERE project REGEXP '^(())$' AND owner = 'alice'",
		"SELECT * FROM t WHERE project IN () AND owner = 'alice'",
	}
	for _, sql := range accepted {
		if m := set.Match(sql, alice); !m.Accepted {
			t.Errorf("empty selection rejected: %+v\n%s", m, sql)
		}
	}
	rejected := []string{
		"SELECT * FROM t WHERE project REGEXP '^(()|.*)$' AND owner = 'alice'",
		"SELECT * FROM t WHERE project REGEXP '^((()))$' AND owner = 'alice'",
		"SELECT * FROM t WHERE project REGEXP '^(()a)$' AND owner = 'alice'",
	}
	for _, sql := range rejected {
		if m := set.Match(sql, alice); m.Accepted {
			t.Errorf("accepted: %s", sql)
		}
	}
}
