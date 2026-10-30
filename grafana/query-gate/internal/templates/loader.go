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
	set := &Set{}
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
		set.templates = append(set.templates, ts...)
		errs = append(errs, es...)
		return nil
	})
	if err != nil {
		return nil, nil, fmt.Errorf("walk %s: %w", dir, err)
	}
	return set, errs, nil
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
	allProjects := hasTag(dash, allProjectsTag)
	var out []*Template
	var errs []CompileError
	for _, src := range collectDashboard(dash, fallbackTitle) {
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
