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
	"strings"
	"testing"
)

func vmap(vs ...Variable) map[string]Variable {
	m := map[string]Variable{}
	for _, v := range vs {
		m[v.Name] = v
	}
	return m
}

func compiled(t *testing.T, sql string, vars map[string]Variable) *Template {
	t.Helper()
	tpl, err := newTemplate("test", sql, vars)
	if err != nil {
		t.Fatalf("compile %q: %v", sql, err)
	}
	return tpl
}

func TestCompileSlotGrammars(t *testing.T) {
	multi := Variable{Name: "v", Type: "query", Multi: true, IncludeAll: true}
	multiAll := Variable{Name: "v", Type: "query", Multi: true, IncludeAll: true, AllValue: "__all"}
	customMulti := Variable{Name: "v", Type: "custom", Multi: true, Query: "a, b"}
	single := Variable{Name: "v", Type: "query"}
	textbox := Variable{Name: "v", Type: "textbox"}
	constant := Variable{Name: "v", Type: "constant", Query: "AND x = 1"}
	quotedConst := Variable{Name: "v", Type: "constant", Query: "it's"}
	customOpts := Variable{Name: "v", Type: "custom", Options: []string{"1d", "7d"}}
	customQuery := Variable{Name: "v", Type: "custom", Query: "Daily : 1d, Weekly : 7d, 30d"}

	tests := []struct {
		name string
		sql  string
		vars map[string]Variable
		ok   []string
		bad  []string
	}{
		{
			name: "multi sqlstring", sql: "x IN (${v:sqlstring})", vars: vmap(multi),
			ok:  []string{"x IN ('a','b')", "x IN ('o''brien')", "x IN ()", "x IN ('a b,c')"},
			bad: []string{"x IN (a)", "x IN ('a' OR 1=1)", `x IN ('a\')`, "x IN ('a','b)", "x IN ('a', 'b')", "x IN (__all)"},
		},
		{
			name: "multi default format", sql: "x IN ($v)", vars: vmap(multi),
			ok:  []string{"x IN ('a','b')", "x IN ()"},
			bad: []string{"x IN (a,b)", "x IN (1)"},
		},
		{
			name: "multi bracket syntax", sql: "x IN ([[v:sqlstring]])", vars: vmap(multi),
			ok:  []string{"x IN ('a')"},
			bad: []string{"x IN (a)"},
		},
		{
			name: "multi with allValue", sql: "x IN (${v})", vars: vmap(multiAll),
			ok:  []string{"x IN ('a','b')", "x IN (__all)"},
			bad: []string{"x IN (__all2)", "x IN (a)"},
		},
		{
			name: "custom multi", sql: "x IN (${v:sqlstring})", vars: vmap(customMulti),
			ok:  []string{"x IN ('a')"},
			bad: []string{"x IN (a)"},
		},
		{
			name: "multi regex", sql: "x REGEXP '^(${v:regex})$'", vars: vmap(multi),
			ok: []string{
				"x REGEXP '^((a|b))$'", "x REGEXP '^(a)$'", `x REGEXP '^(a\-b\.c\ d)$'`, `x REGEXP '^(a\\b)$'`,
				"x REGEXP '^(proj-1)$'", "x REGEXP '^(é)$'",
			},
			bad: []string{
				"x REGEXP '^(a|b)$'", "x REGEXP '^(a'|1)$'", `x REGEXP '^(a\)$'`, `x REGEXP '^(a\'b)$'`, "x REGEXP '^()$'",
				"x REGEXP '^(a.*)$'", "x REGEXP '^(a|)$'", "x REGEXP '^(a\nb)$'", "x REGEXP '^(a)(b)$'",
			},
		},
		{
			name: "multi regex with allValue", sql: "x REGEXP '${v:regex}'", vars: vmap(multiAll),
			ok:  []string{"x REGEXP '(a|b)'", "x REGEXP '__all'"},
			bad: []string{"x REGEXP '(__all'"},
		},
		{
			name: "single sqlstring", sql: "x = ${v:sqlstring}", vars: vmap(single),
			ok:  []string{"x = 'a'", "x = 'it''s'", "x = ''"},
			bad: []string{"x = 'a','b'", "x = a", "x = 'a' OR 1=1", `x = 'a\'`},
		},
		{
			name: "single regex", sql: "x REGEXP '${v:regex}'", vars: vmap(single),
			ok:  []string{"x REGEXP 'abc'", `x REGEXP 'a\-b'`},
			bad: []string{"x REGEXP 'a.b'", "x REGEXP ''"},
		},
		{
			name: "single default inside quotes", sql: "x LIKE '%${v}%'", vars: vmap(single),
			ok:  []string{"x LIKE '%abc%'", "x LIKE '%it''s%'", "x LIKE '%%'", "x LIKE '%a b%'"},
			bad: []string{"x LIKE '%a'b%'", `x LIKE '%a\%'`, "x LIKE '%a' OR '1%'"},
		},
		{
			name: "textbox", sql: "x LIKE '%${v}%' AND y = ${v:sqlstring}", vars: vmap(textbox),
			ok:  []string{"x LIKE '%q%' AND y = 'q'"},
			bad: []string{"x LIKE '%q%' AND y = q"},
		},
		{
			name: "constant raw", sql: "SELECT 1 ${v:raw}", vars: vmap(constant),
			ok:  []string{"SELECT 1 AND x = 1"},
			bad: []string{"SELECT 1 AND x = 2", "SELECT 1 "},
		},
		{
			name: "constant default format", sql: "SELECT 1 ${v}", vars: vmap(constant),
			ok: []string{"SELECT 1 AND x = 1"},
		},
		{
			name: "constant sqlstring", sql: "y = ${v:sqlstring}", vars: vmap(quotedConst),
			ok:  []string{"y = 'it''s'"},
			bad: []string{"y = 'its'"},
		},
		{
			name: "custom options raw", sql: "g = '${v}'", vars: vmap(customOpts),
			ok:  []string{"g = '1d'", "g = '7d'"},
			bad: []string{"g = '1d OR 1'", "g = '30d'", "g = ''"},
		},
		{
			name: "custom options sqlstring", sql: "g = ${v:sqlstring}", vars: vmap(customOpts),
			ok:  []string{"g = '1d'", "g = '7d'"},
			bad: []string{"g = 1d", "g = '30d'"},
		},
		{
			name: "custom options from query", sql: "g = '${v:raw}'", vars: vmap(customQuery),
			ok:  []string{"g = '1d'", "g = '7d'", "g = '30d'"},
			bad: []string{"g = 'Daily'", "g = 'Daily : 1d'"},
		},
		{
			name: "dollar one is literal", sql: "REGEXP_REPLACE(t, '^(a)-(b)', '$1 $2')", vars: vmap(),
			ok:  []string{"REGEXP_REPLACE(t, '^(a)-(b)', '$1 $2')"},
			bad: []string{"REGEXP_REPLACE(t, '^(a)-(b)', 'x y')"},
		},
		{
			name: "unknown names are literal", sql: "a = '$nothing' AND b = '${other}' AND c = '[[more]]'", vars: vmap(),
			ok: []string{"a = '$nothing' AND b = '${other}' AND c = '[[more]]'"},
		},
		{
			name: "macros are literal", sql: "WHERE $__timeFilter(created_date) AND $__unixEpochFilter(ts)", vars: vmap(),
			ok:  []string{"WHERE $__timeFilter(created_date) AND $__unixEpochFilter(ts)"},
			bad: []string{"WHERE 1=1 AND $__unixEpochFilter(ts)", "WHERE $__timeFilter(other) AND $__unixEpochFilter(ts)"},
		},
		{
			name: "login", sql: "o = ${__user.login:sqlstring}", vars: vmap(),
			ok:  []string{"o = 'bob'", "o = 'it''s'"},
			bad: []string{"o = bob", "o = 'a' OR 'b'"},
		},
		{
			name: "email", sql: "o = ${__user.email:sqlstring}", vars: vmap(),
			ok:  []string{"o = 'a@example.test'", "o = 'o''neil@example.test'"},
			bad: []string{"o = a@example.test", "o = 'a' OR 'b'"},
		},
		{
			name: "raw on single variable", sql: "x = ${v:raw}", vars: vmap(single),
			ok:  []string{"x = 24", "x = 1.5"},
			bad: []string{"x = 1 OR 1=1", "x = -1", "x = 1;", "x = ", "x = 1e5", "x = 0x1F", "x = 1 --"},
		},
		{
			name: "default format outside quotes", sql: "x = ${v}", vars: vmap(single),
			ok:  []string{"x = 24", "x = 1.5"},
			bad: []string{"x = 1 OR 1=1", "x = -1", "x = 1;", "x = ", "x = 1e5", "x = 0x1F", "x = 1 --"},
		},
		{
			name: "value in double quotes", sql: `x = "${v}"`, vars: vmap(single),
			ok:  []string{`x = "good first issue"`, `x = "it''s"`},
			bad: []string{`x = "a"b"`, `x = "a\b"`, `x = "it's"`, `x = "" OR "1"="1"`},
		},
		{
			name: "textbox number", sql: "x < $v", vars: vmap(textbox),
			ok:  []string{"x < 24", "x < 7.5"},
			bad: []string{"x < 24 OR 1=1", "x < -1", "x < 24)", "x < 24 --", "x < 1e3", "x < "},
		},
		{
			name: "raw inside single quotes", sql: "x = '${v:raw}'", vars: vmap(single),
			ok:  []string{"x = '2023'", "x = 'a b'", `x = 'x"y'`},
			bad: []string{"x = 'a'b'", `x = 'a\b'`, "x = '' OR '1'='1'"},
		},
		{
			name: "raw inside double quotes", sql: `x = "${v:raw}"`, vars: vmap(single),
			ok:  []string{`x = "2023"`, `x = "a'b"`},
			bad: []string{`x = "a"b"`, `x = "a\b"`},
		},
		{
			name: "epoch to", sql: "FROM_UNIXTIME($__to / 1000)", vars: vmap(),
			ok:  []string{"FROM_UNIXTIME(1730000000000 / 1000)"},
			bad: []string{"FROM_UNIXTIME(1 OR 1 / 1000)", "FROM_UNIXTIME('x' / 1000)", "FROM_UNIXTIME(12345678901234567 / 1000)", "FROM_UNIXTIME( / 1000)", "FROM_UNIXTIME(-1 / 1000)"},
		},
		{
			name: "epoch from braces", sql: "x > ${__from}", vars: vmap(),
			ok:  []string{"x > 0", "x > 1730000000000"},
			bad: []string{"x > 1;", "x > 1 1"},
		},
		{
			name: "raw list in quotes", sql: "( '${v:raw}' = '' OR x IN (${v:sqlstring}) )", vars: vmap(multi),
			ok:  []string{"( 'a,b' = '' OR x IN ('a','b') )", "( '' = '' OR x IN () )"},
			bad: []string{"( 'a'b' = '' OR x IN ('a','b') )", `( 'a\b' = '' OR x IN ('a','b') )`},
		},
		{
			name: "csv inside quotes", sql: "x = '${v:csv}'", vars: vmap(multi),
			ok:  []string{"x = 'a,b'", "x = 'a'"},
			bad: []string{"x = 'a'b'", `x = 'a\b'`},
		},
		{
			name: "builtin all is literal", sql: "x = '$__all'", vars: vmap(),
			ok:  []string{"x = '$__all'"},
			bad: []string{"x = 'anything'"},
		},
		{
			name: "raw numeric list", sql: "x IN (${v:raw})", vars: vmap(multi),
			ok:  []string{"x IN (1)", "x IN (1,2,30)"},
			bad: []string{"x IN (1) OR (1=1)", "x IN (a)", "x IN (1,,2)", "x IN ()"},
		},
		{
			name: "raw list with allValue", sql: "x IN (${v:raw})", vars: vmap(multiAll),
			ok:  []string{"x IN (1,2)", "x IN (__all)"},
			bad: []string{"x IN (__all2)", "x IN (a)"},
		},
		{
			name: "value in dash comment", sql: "-- x IN (${v:sqlstring})\nSELECT 1", vars: vmap(multi),
			ok:  []string{"-- x IN ('a','b')\nSELECT 1", "-- x IN (anything ' \" */ here)\nSELECT 1"},
			bad: []string{"-- x IN (a\nSELECT 2)\nSELECT 1", "-- x IN (a\rb)\nSELECT 1"},
		},
		{
			name: "value in hash comment", sql: "# x IN (${v:sqlstring})\nSELECT 1", vars: vmap(multi),
			ok:  []string{"# x IN ('a','b')\nSELECT 1", "# x IN (anything ' \" */ here)\nSELECT 1"},
			bad: []string{"# x IN (a\nSELECT 2)\nSELECT 1", "# x IN (a\rb)\nSELECT 1"},
		},
		{
			name: "value in block comment", sql: "/* ${v} */ SELECT 1", vars: vmap(single),
			ok:  []string{"/* abc */ SELECT 1", "/* it's */ SELECT 1"},
			bad: []string{"/* */ SELECT 2 /* */ SELECT 1", "/* a* */ SELECT 1", "/* a/b */ SELECT 1"},
		},
		{
			name: "value in block comment cannot open executable", sql: "SELECT 1 /*${v}*/", vars: vmap(single),
			ok:  []string{"SELECT 1 /*x!*/", "SELECT 1 /**/"},
			bad: []string{"SELECT 1 /*!50000 x*/", "SELECT 1 /*+x*/"},
		},
		{
			name: "slot after spaced dash", sql: "SELECT 1 - ${v}", vars: vmap(single),
			ok: []string{"SELECT 1 - 5"},
		},
		{
			name: "raw list with dollar allValue", sql: "x IN (${v:raw})", vars: vmap(Variable{Name: "v", Type: "query", Multi: true, IncludeAll: true, AllValue: "$__all"}),
			ok:  []string{"x IN ($__all)", "x IN (1,2)"},
			bad: []string{"x IN (a)"},
		},
		{
			name: "custom option after dash", sql: "INTERVAL -${v} DAY", vars: vmap(Variable{Name: "v", Type: "custom", Options: []string{"1", "7"}}),
			ok:  []string{"INTERVAL -7 DAY"},
			bad: []string{"INTERVAL -8 DAY"},
		},
		{
			name: "newlines and case in literals", sql: "SELECT 1\nFROM t\tWHERE (a = ${v:sqlstring})", vars: vmap(single),
			ok:  []string{"SELECT 1\nFROM t\tWHERE (a = 'x')"},
			bad: []string{"select 1\nFROM t\tWHERE (a = 'x')"},
		},
		{
			name: "numeric slot inside macro", sql: "$__timeGroupAlias(t, ${v:raw})", vars: vmap(single),
			ok:  []string{"$__timeGroupAlias(t, 3600)"},
			bad: []string{"$__timeGroupAlias(t, 3600 OR 1=1)"},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tpl := compiled(t, tc.sql, tc.vars)
			for _, s := range tc.ok {
				if !tpl.re.MatchString(s) {
					t.Errorf("expected match: %q", s)
				}
			}
			for _, s := range tc.bad {
				if tpl.re.MatchString(s) {
					t.Errorf("expected no match: %q", s)
				}
			}
		})
	}
}

func TestCompileErrors(t *testing.T) {
	multi := Variable{Name: "v", Type: "query", Multi: true, IncludeAll: true}
	single := Variable{Name: "v", Type: "query"}
	quotedOpt := Variable{Name: "v", Type: "custom", Options: []string{"a", "b'c"}}
	tests := []struct {
		name string
		sql  string
		vars map[string]Variable
		want string
	}{
		{"unknown builtin", "SELECT $__interval", vmap(), "unsupported built-in"},
		{"unknown builtin braces", "SELECT ${__from:date:iso}", vmap(), "unsupported built-in"},
		{"unknown builtin interval braces", "SELECT ${__interval}", vmap(), "unsupported built-in"},
		{"login without sqlstring", "x = ${__user.login}", vmap(), "sqlstring"},
		{"login with raw", "x = ${__user.login:raw}", vmap(), "sqlstring"},
		{"login inside quotes", "x = '${__user.login:sqlstring}'", vmap(), "context"},
		{"login raw inside quotes", "x = '${__user.login:raw}'", vmap(), "sqlstring"},
		{"login in dash comment", "-- ${__user.login:sqlstring}\nSELECT 1", vmap(), "context"},
		{"login default format in comment", "-- ${__user.login}\nSELECT 1", vmap(), "sqlstring"},
		{"email without sqlstring", "x = ${__user.email}", vmap(), "__user.email requires the sqlstring format"},
		{"email with raw", "x = ${__user.email:raw}", vmap(), "__user.email requires the sqlstring format"},
		{"email inside quotes", "x = '${__user.email:sqlstring}'", vmap(), "context"},
		{"value in backtick", "SELECT `${v}`", vmap(single), "context"},
		{"singlequote on multi variable", "x IN (${v:singlequote})", vmap(multi), "unsupported format"},
		{"regex outside quotes", "x REGEXP ${v:regex}", vmap(multi), "context"},
		{"sqlstring inside quotes", "x = '${v:sqlstring}'", vmap(single), "context"},
		{"executable comment", "SELECT /*! 1 */ 1", vmap(), "executable comment"},
		{"custom option with quote", "x = ${v}", vmap(quotedOpt), "contains"},
		{"custom option comment", "x = ${v}", vmap(Variable{Name: "v", Type: "custom", Options: []string{"a--b"}}), "contains"},
		{"custom without options", "x = ${v}", vmap(Variable{Name: "v", Type: "custom"}), "no options"},
		{"custom with regex format", "x = ${v:regex}", vmap(Variable{Name: "v", Type: "custom", Options: []string{"a"}}), "unsupported format"},
		{"constant with regex format", "x = ${v:regex}", vmap(Variable{Name: "v", Type: "constant", Query: "a"}), "unsupported format"},
		{"unsupported variable type", "x = ${v}", vmap(Variable{Name: "v", Type: "interval"}), "unsupported variable type"},
		{"slot after backslash", `x = 'a\${v}'`, vmap(single), "backslash"},
		{"slot after dollar", "x = '$${v}'", vmap(single), "dollar sign"},
		{"slot after dollar name", "x = '$abc${v}'", vmap(single), "dollar sign"},
		{"text slot in macro", "SELECT $__timeFrom(${v:sqlstring})", vmap(single), "macro call"},
		{"login in macro", "WHERE $__timeFilter(${__user.login:sqlstring})", vmap(), "macro call"},
		{"custom option with dollar", "x = ${v}", vmap(Variable{Name: "v", Type: "custom", Options: []string{"a$b"}}), "contains"},
		{"possibly empty list after dash", "SELECT 1 -${v:sqlstring}- 1", vmap(multi), "dash"},
		{"slot after dash", "SELECT 1 -${v:sqlstring}", vmap(multi), "dash or slash"},
		{"slot after slash", "SELECT 1 /${v:sqlstring}", vmap(multi), "dash or slash"},
		{"backslash in backticks", "SELECT `a\\b` WHERE x = ${v:sqlstring}", vmap(single), "backticks"},
		{"custom option leading dash", "x = ${v}", vmap(Variable{Name: "v", Type: "custom", Options: []string{"-1"}}), "starts or ends"},
		{"all value with quote", "x IN (${v:sqlstring})", vmap(Variable{Name: "v", Type: "query", Multi: true, IncludeAll: true, AllValue: "'x"}), "plain SQL fragment"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := newTemplate("test", tc.sql, tc.vars)
			if err == nil {
				t.Fatalf("expected an error containing %q", tc.want)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("error %q does not contain %q", err, tc.want)
			}
		})
	}
}

func TestQuotedValuesRejectMacroSyntax(t *testing.T) {
	multi := Variable{Name: "v", Type: "query", Multi: true, IncludeAll: true}
	single := Variable{Name: "v", Type: "query"}
	tests := []struct {
		name string
		sql  string
		vars map[string]Variable
		ok   []string
		bad  []string
	}{
		{
			name: "multi sqlstring", sql: "x IN (${v:sqlstring})", vars: vmap(multi),
			ok:  []string{"x IN ('US$')", "x IN ('a $ b')", "x IN ('$')", "x IN ('$(')"},
			bad: []string{"x IN ('$__timeFrom(')", "x IN ('a','$__timeTo(x')", "x IN ('a$b(')"},
		},
		{
			name: "single sqlstring", sql: "x = ${v:sqlstring}", vars: vmap(single),
			ok:  []string{"x = 'US$'", "x = 'a $ b'", "x = '$'", "x = '$('"},
			bad: []string{"x = '$__timeFrom('", "x = '$__timeTo(x'", "x = 'a$b('"},
		},
		{
			name: "single default in single quotes", sql: "x = '${v}'", vars: vmap(single),
			ok:  []string{"x = 'a $ b'", "x = '$('"},
			bad: []string{"x = '$__timeFrom('", "x = 'a$'"},
		},
		{
			name: "single default in double quotes", sql: `x = "${v}"`, vars: vmap(single),
			ok:  []string{`x = "a $ b"`},
			bad: []string{`x = "$__timeFilter("`},
		},
		{
			name: "raw in single quotes", sql: "x = '${v:raw}'", vars: vmap(single),
			ok:  []string{"x = 'a $ b'"},
			bad: []string{"x = '$__timeFrom('", "x = 'a$'"},
		},
		{
			name: "raw in double quotes", sql: `x = "${v:raw}"`, vars: vmap(single),
			ok:  []string{`x = "a $ b"`},
			bad: []string{`x = "$__timeFrom("`, `x = "a$"`},
		},
		{
			name: "regex", sql: "x REGEXP '${v:regex}'", vars: vmap(multi),
			ok:  []string{`x REGEXP 'a\$ b'`, "x REGEXP '(a|b)'"},
			bad: []string{`x REGEXP '\$__timeFrom\('`, `x REGEXP '(a|\$b)'`, `x REGEXP 'a\$'`},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tpl := compiled(t, tc.sql, tc.vars)
			for _, s := range tc.ok {
				if !tpl.re.MatchString(s) {
					t.Errorf("expected match: %q", s)
				}
			}
			for _, s := range tc.bad {
				if tpl.re.MatchString(s) {
					t.Errorf("expected no match: %q", s)
				}
			}
		})
	}
}
