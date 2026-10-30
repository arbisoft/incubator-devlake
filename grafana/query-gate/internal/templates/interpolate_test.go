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
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const regexSpecials = `\^$*+?.()|[]{}/,#- `

// regexEscape mirrors Grafana's regex format; quotes are swapped out because the gate must reject them in regex slots.
func regexEscape(v string) string {
	var b strings.Builder
	for _, r := range strings.ReplaceAll(v, "'", "q") {
		if strings.ContainsRune(regexSpecials, r) {
			b.WriteByte('\\')
		}
		b.WriteRune(r)
	}
	return b.String()
}

func quoteAll(vals []string) string {
	q := make([]string, len(vals))
	for i, v := range vals {
		q[i] = quoteSQL(v)
	}
	return strings.Join(q, ",")
}

func formatRegex(vals []string) string {
	esc := make([]string, len(vals))
	for i, v := range vals {
		esc[i] = regexEscape(v)
	}
	if len(esc) == 1 {
		return esc[0]
	}
	return "(" + strings.Join(esc, "|") + ")"
}

// interpolate substitutes slot values the way Grafana does for the given selection.
func interpolate(t *testing.T, sql string, vars map[string]Variable, c Caller, vals []string) string {
	t.Helper()
	var out strings.Builder
	for i := 0; i < len(sql); {
		if sql[i] != '$' && sql[i] != '[' {
			out.WriteByte(sql[i])
			i++
			continue
		}
		name, format, end, ok := parseSlot(sql, i)
		if !ok {
			out.WriteByte(sql[i])
			i++
			continue
		}
		v, known := vars[name]
		switch {
		case backendMacros[name] && end < len(sql) && sql[end] == '(':
			out.WriteString(sql[i:end])
		case name == "__user.login":
			out.WriteString(quoteSQL(c.Login))
		case name == "__user.email":
			out.WriteString(quoteSQL(c.Email))
		case !known:
			out.WriteString(sql[i:end])
		case v.Type == "constant":
			if format == "sqlstring" {
				out.WriteString(quoteSQL(v.Query))
			} else {
				out.WriteString(v.Query)
			}
		case v.Type == "custom" && !v.Multi && !v.IncludeAll:
			opt := customOptions(v)[0]
			if format == "sqlstring" {
				opt = quoteSQL(opt)
			}
			out.WriteString(opt)
		case v.Multi || v.IncludeAll:
			if format == "regex" {
				out.WriteString(formatRegex(vals))
			} else {
				out.WriteString(quoteAll(vals))
			}
		default:
			switch format {
			case "sqlstring":
				out.WriteString(quoteSQL(vals[0]))
			case "regex":
				out.WriteString(regexEscape(vals[0]))
			default:
				out.WriteString(strings.ReplaceAll(vals[0], "'", "''"))
			}
		}
		i = end
	}
	return out.String()
}

var (
	alice   = Caller{Login: "alice", Email: "alice@example.test"}
	mallory = Caller{Login: "mallory", Email: "mallory@example.test"}
)

var interpolationSelections = map[string][]string{
	"single":      {"alpha"},
	"multi":       {"alpha", "beta gamma"},
	"quote":       {"o'brien"},
	"quote list":  {"o'brien", "x'y"},
	"specials":    {"x-y.z", "a b"},
	"email chars": {"a.b+tag@example.test"},
	"path":        {"org/repo-name"},
	"keys":        {"em:dev@example.test", "gh:12345"},
	"unicode":     {"José Núñez", "Zoë"},
	"ampersand":   {"R&D (east)"},
}

func runInterpolatedMatch(t *testing.T, set *Set, sources []source, exactLocation bool) {
	t.Helper()
	for _, src := range sources {
		for name, vals := range interpolationSelections {
			t.Run(fmt.Sprintf("%s/%s", src.Location, name), func(t *testing.T) {
				sql := interpolate(t, src.SQL, src.Vars, alice, vals)
				got := set.Match(sql, alice)
				if !got.Accepted || (exactLocation && got.Location != src.Location) {
					t.Fatalf("not accepted for the caller: %+v\nSQL: %s", got, sql)
				}
				other := set.Match(sql, mallory)
				if other.Accepted || other.Reason != ReasonLoginMismatch {
					t.Fatalf("accepted for another caller: %+v", other)
				}
			})
		}
	}
}

func TestMatchInterpolatedTemplates(t *testing.T) {
	set, errs, err := LoadDir("testdata")
	if err != nil || len(errs) != 0 {
		t.Fatalf("load: %v %v", err, errs)
	}
	sources := collectTestSources(t, "testdata")
	if len(sources) < 8 || set.Len() != len(sources) {
		t.Fatalf("sources = %d, compiled = %d", len(sources), set.Len())
	}
	runInterpolatedMatch(t, set, sources, true)
}

func TestMatchInterpolatedShippedDashboards(t *testing.T) {
	const dir = "../../../dashboards"
	set, errs, err := LoadDir(dir)
	if err != nil || len(errs) != 0 {
		t.Fatalf("load: %v %v", err, errs)
	}
	if noLogin := set.NoLogin(); len(noLogin) != 0 {
		t.Fatalf("queries without a login filter: %q", noLogin)
	}
	sources := collectTestSources(t, dir)
	if len(sources) == 0 || set.Len() != len(sources) {
		t.Fatalf("sources = %d, compiled = %d", len(sources), set.Len())
	}
	// Shipped dashboards repeat identical queries, so only acceptance is checked, not which copy matched.
	runInterpolatedMatch(t, set, sources, false)
}

func collectTestSources(t *testing.T, dir string) []source {
	t.Helper()
	var sources []source
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil || d.IsDir() || !strings.HasSuffix(d.Name(), ".json") {
			return walkErr
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var dash map[string]any
		if err := json.Unmarshal(data, &dash); err != nil {
			return err
		}
		sources = append(sources, collectDashboard(dash, strings.TrimSuffix(d.Name(), ".json"))...)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return sources
}
