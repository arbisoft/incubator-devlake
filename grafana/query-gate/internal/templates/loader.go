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
	"sort"
	"strings"
)

// CompileError is a template that could not be compiled or a file that could not be parsed.
type CompileError struct {
	Location string
	Message  string
}

func (e CompileError) Error() string { return e.Location + ": " + e.Message }

// allProjectsTag marks a dashboard whose queries are safe for any caller.
const allProjectsTag = "devlake:all-projects"

type source struct {
	Location string
	SQL      string
	Vars     map[string]Variable
}

// LoadDir compiles every saved query found in the dashboard JSON files under dir.
func LoadDir(dir string) (*Set, []CompileError, error) {
	var parts [][]*Template
	var errs []CompileError
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() || !strings.HasSuffix(d.Name(), ".json") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		rel, relErr := filepath.Rel(dir, path)
		if relErr != nil {
			rel = path
		}
		ts, es := loadDashboard(data, rel, strings.TrimSuffix(d.Name(), ".json"))
		parts = append(parts, ts)
		errs = append(errs, es...)
		return nil
	})
	if err != nil {
		return nil, nil, fmt.Errorf("walk %s: %w", dir, err)
	}
	return NewSet(parts...), errs, nil
}

// LoadDashboard compiles every saved query of one dashboard JSON document; source names it in parse errors.
func LoadDashboard(raw []byte, source string) ([]*Template, []CompileError) {
	return loadDashboard(raw, source, source)
}

func loadDashboard(raw []byte, source, fallbackTitle string) ([]*Template, []CompileError) {
	var dash map[string]any
	if err := json.Unmarshal(raw, &dash); err != nil {
		return nil, []CompileError{{Location: source, Message: "invalid dashboard JSON: " + err.Error()}}
	}
	tagged, sources := collectSources(dash, fallbackTitle)
	allProjects := hasTag(tagged, allProjectsTag)
	var out []*Template
	var errs []CompileError
	for _, src := range sources {
		t, err := newTemplate(src.Location, src.SQL, src.Vars)
		if err != nil {
			errs = append(errs, CompileError{Location: src.Location, Message: err.Error()})
			continue
		}
		t.AllProjects = allProjects
		out = append(out, t)
	}
	return out, errs
}

func hasTag(dash map[string]any, tag string) bool {
	tags, _ := dash["tags"].([]any)
	for _, t := range tags {
		if s, ok := t.(string); ok && s == tag {
			return true
		}
	}
	return false
}

func str(m map[string]any, key string) string {
	s, _ := m[key].(string)
	return s
}

func obj(m map[string]any, key string) map[string]any {
	o, _ := m[key].(map[string]any)
	return o
}

func list(m map[string]any, key string) []map[string]any {
	raw, _ := m[key].([]any)
	var out []map[string]any
	for _, e := range raw {
		if o, ok := e.(map[string]any); ok {
			out = append(out, o)
		}
	}
	return out
}

// v2Spec returns the spec of a v2 dashboard document or a bare v2 spec, and false for classic JSON.
func v2Spec(dash map[string]any) (map[string]any, bool) {
	if str(dash, "kind") == "Dashboard" && strings.HasPrefix(str(dash, "apiVersion"), "dashboard.grafana.app/v2") {
		return obj(dash, "spec"), true
	}
	if _, ok := dash["elements"].(map[string]any); ok {
		for _, k := range []string{"panels", "rows", "templating"} {
			if _, has := dash[k]; has {
				return nil, false
			}
		}
		return dash, true
	}
	return nil, false
}

// collectSources returns the object that carries the tags and the saved queries of a classic or v2 dashboard.
func collectSources(dash map[string]any, fallbackTitle string) (map[string]any, []source) {
	if spec, ok := v2Spec(dash); ok {
		return spec, collectV2(spec, fallbackTitle)
	}
	return dash, collectDashboard(dash, fallbackTitle)
}

var v2VariableTypes = map[string]string{
	"QueryVariable":      "query",
	"CustomVariable":     "custom",
	"ConstantVariable":   "constant",
	"TextVariable":       "textbox",
	"DatasourceVariable": "datasource",
	"IntervalVariable":   "interval",
}

func collectV2(spec map[string]any, fallbackTitle string) []source {
	title := str(spec, "title")
	if title == "" {
		title = fallbackTitle
	}
	vars := map[string]Variable{}
	var queryVars []map[string]any
	for _, item := range list(spec, "variables") {
		v := v2Variable(item)
		variable := parseVariable(v)
		if variable.Name != "" {
			vars[variable.Name] = variable
		}
		if variable.Type == "query" {
			queryVars = append(queryVars, v)
		}
	}
	var out []source
	elements := obj(spec, "elements")
	names := make([]string, 0, len(elements))
	for name := range elements {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		panel, _ := elements[name].(map[string]any)
		if str(panel, "kind") != "Panel" {
			continue
		}
		pspec := obj(panel, "spec")
		for _, q := range list(obj(obj(pspec, "data"), "spec"), "queries") {
			qspec := obj(q, "spec")
			if sql := str(obj(obj(qspec, "query"), "spec"), "rawSql"); sql != "" {
				loc := fmt.Sprintf("%s :: %s [%s]", title, str(pspec, "title"), str(qspec, "refId"))
				out = append(out, source{Location: loc, SQL: sql, Vars: vars})
			}
		}
	}
	for _, v := range queryVars {
		if sql := variableSQL(v); sql != "" {
			out = append(out, source{Location: fmt.Sprintf("%s :: var %s", title, str(v, "name")), SQL: sql, Vars: vars})
		}
	}
	return out
}

// v2Variable rewrites a v2 variable into the classic shape that parseVariable reads.
func v2Variable(item map[string]any) map[string]any {
	vs := obj(item, "spec")
	kind := str(item, "kind")
	typ, ok := v2VariableTypes[kind]
	if !ok {
		typ = strings.ToLower(kind)
	}
	v := map[string]any{"type": typ}
	for _, k := range []string{"name", "multi", "includeAll", "allValue", "options"} {
		if val, has := vs[k]; has {
			v[k] = val
		}
	}
	switch q := vs["query"].(type) {
	case string:
		v["query"] = q
	case map[string]any:
		v["query"] = map[string]any{"rawSql": str(obj(q, "spec"), "rawSql")}
	}
	return v
}

func collectDashboard(dash map[string]any, fallbackTitle string) []source {
	title := str(dash, "title")
	if title == "" {
		title = fallbackTitle
	}
	vars := map[string]Variable{}
	var queryVars []map[string]any
	if tpl, ok := dash["templating"].(map[string]any); ok {
		for _, v := range list(tpl, "list") {
			variable := parseVariable(v)
			if variable.Name != "" {
				vars[variable.Name] = variable
			}
			if variable.Type == "query" {
				queryVars = append(queryVars, v)
			}
		}
	}
	var out []source
	var walk func(panels []map[string]any)
	walk = func(panels []map[string]any) {
		for _, p := range panels {
			for _, t := range list(p, "targets") {
				if sql := str(t, "rawSql"); sql != "" {
					loc := fmt.Sprintf("%s :: %s [%s]", title, str(p, "title"), str(t, "refId"))
					out = append(out, source{Location: loc, SQL: sql, Vars: vars})
				}
			}
			walk(list(p, "panels"))
		}
	}
	walk(list(dash, "panels"))
	for _, row := range list(dash, "rows") {
		walk(list(row, "panels"))
	}
	for _, v := range queryVars {
		if sql := variableSQL(v); sql != "" {
			out = append(out, source{Location: fmt.Sprintf("%s :: var %s", title, str(v, "name")), SQL: sql, Vars: vars})
		}
	}
	return out
}

func variableSQL(v map[string]any) string {
	switch q := v["query"].(type) {
	case string:
		return q
	case map[string]any:
		if sql := str(q, "rawSql"); sql != "" {
			return sql
		}
		return str(q, "query")
	}
	return ""
}

func parseVariable(v map[string]any) Variable {
	variable := Variable{Name: str(v, "name"), Type: str(v, "type"), Query: str(v, "query")}
	variable.Multi, _ = v["multi"].(bool)
	variable.IncludeAll, _ = v["includeAll"].(bool)
	variable.AllValue = str(v, "allValue")
	for _, o := range list(v, "options") {
		if val := str(o, "value"); val != "" {
			variable.Options = append(variable.Options, val)
		}
	}
	return variable
}
