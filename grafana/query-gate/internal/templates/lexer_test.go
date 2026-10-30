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

import "testing"

func TestLexerStates(t *testing.T) {
	tests := []struct {
		name string
		text string
		want lexState
	}{
		{"plain", "SELECT 1", stateNormal},
		{"open single", "x = 'abc", stateSingleQuoted},
		{"closed single", "x = 'abc'", stateNormal},
		{"doubled quote stays inside", "x = 'it''s", stateSingleQuoted},
		{"backslash quote stays inside", `x = 'it\'s`, stateSingleQuoted},
		{"backslash backslash closes", `x = 'a\\'`, stateNormal},
		{"open double", `x = "abc`, stateDoubleQuoted},
		{"doubled double quote", `x = "a""b`, stateDoubleQuoted},
		{"open backtick", "SELECT `a", stateBacktick},
		{"doubled backtick", "SELECT `a``b", stateBacktick},
		{"dash comment", "SELECT 1 -- note", stateLineComment},
		{"dash comment ended", "SELECT 1 -- note\nFROM t", stateNormal},
		{"dash tab comment", "SELECT 1 --\tnote", stateLineComment},
		{"dashes without space", "SELECT 1--1", stateNormal},
		{"hash comment", "SELECT 1 # note", stateLineComment},
		{"block comment", "SELECT /* note", stateBlockComment},
		{"block comment closed", "SELECT /* note */ 1", stateNormal},
		{"apostrophe in dash comment", "-- the users' prompts", stateLineComment},
		{"apostrophe in block comment", "/* the users' prompts */ SELECT 1", stateNormal},
		{"comment marker in string", "x = '-- not a comment", stateSingleQuoted},
		{"quote in double quotes", `x = "it's"`, stateNormal},
		{"quote in backticks", "SELECT `it's`", stateNormal},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var l lexer
			l.feed(tc.text)
			if l.state != tc.want {
				t.Fatalf("state after %q = %d, want %d", tc.text, l.state, tc.want)
			}
		})
	}
}

func TestLexerCompilesCommentsWithApostrophes(t *testing.T) {
	vars := vmap(Variable{Name: "v", Type: "query", Multi: true, IncludeAll: true}, Variable{Name: "s", Type: "query"})
	tests := []struct {
		name string
		sql  string
		ok   string
	}{
		{"apostrophe in line comment", "-- the users' prompts\nSELECT 1 WHERE x IN (${v:sqlstring})", "-- the users' prompts\nSELECT 1 WHERE x IN ('a')"},
		{"escaped quote then slot", `SELECT 'it\'s', ${s:sqlstring}`, `SELECT 'it\'s', 'a'`},
		{"doubled quote then slot", `SELECT 'it''s', ${s:sqlstring}`, `SELECT 'it''s', 'a'`},
		{"dashes without space are not a comment", "SELECT 5--${s:sqlstring}", "SELECT 5--'a'"},
		{"dashes in a string", "SELECT '--', ${s:sqlstring}", "SELECT '--', 'a'"},
		{"hash in a string", "SELECT '#', ${s:sqlstring}", "SELECT '#', 'a'"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tpl := compiled(t, tc.sql, vars)
			if !tpl.re.MatchString(tc.ok) {
				t.Fatalf("expected %q to match", tc.ok)
			}
		})
	}
}
