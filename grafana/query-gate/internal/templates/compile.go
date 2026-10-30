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
	"errors"
	"fmt"
	"regexp"
	"strings"
)

const (
	patQStr     = `'(?:[^'\\]|'')*'`
	patQList    = `(?:` + patQStr + `(?:,` + patQStr + `)*)?`
	patInner    = `(?:[^'\\]|'')*`
	patRegexEsc = `\\[\\^$*+?.()|\[\]{}/,#\- ]`
	patRegexPl  = `[^'\\^$*+?.()|\[\]{}\x00-\x1f]`
	patRegexAtm = `(?:` + patRegexPl + `|` + patRegexEsc + `)`
	patRegexLst = `(?:\(` + patRegexAtm + `+(?:\|` + patRegexAtm + `+)*\)|` + patRegexAtm + `+)`
	// patRegexAny adds the empty group Grafana sends for an All selection with no options.
	patRegexAny = `(?:` + patRegexLst + `|\(\))`
)

// Variable is the subset of a dashboard template variable the compiler needs.
type Variable struct {
	Name       string
	Type       string
	Query      string
	Multi      bool
	IncludeAll bool
	AllValue   string
	Options    []string
}

var backendMacros = map[string]bool{
	"__timeFilter": true, "__timeFrom": true, "__timeTo": true, "__timeGroup": true, "__timeGroupAlias": true,
	"__unixEpochFilter": true, "__unixEpochFrom": true, "__unixEpochTo": true,
	"__unixEpochNanoFilter": true, "__unixEpochNanoFrom": true, "__unixEpochNanoTo": true,
	"__unixEpochGroup": true, "__unixEpochGroupAlias": true,
}

var (
	braceNameRe = regexp.MustCompile(`^[A-Za-z0-9_.]+$`)
	fmtRe       = regexp.MustCompile(`^[A-Za-z0-9_:]*$`)
	wordRe      = regexp.MustCompile(`^\w+`)
)

// slotKind says how a resolved slot is rendered into the pattern.
type slotKind int

const (
	slotPattern slotKind = iota
	slotCaller
	slotLiteral
	slotOptions
	slotUnknown
)

// callerField names which caller attribute a slotCaller slot must hold.
type callerField int

const (
	fieldLogin callerField = iota
	fieldEmail
	fieldCount
)

var callerSlots = [fieldCount]struct{ name, group string }{
	fieldLogin: {"__user.login", "login"},
	fieldEmail: {"__user.email", "email"},
}

type slotPlan struct {
	kind       slotKind
	field      callerField
	pattern    string
	need       lexState
	text       string
	options    []string
	canBeEmpty bool
}

func parseSlot(s string, i int) (name, format string, end int, ok bool) {
	switch {
	case strings.HasPrefix(s[i:], "${"):
		j := strings.IndexByte(s[i:], '}')
		if j < 0 {
			return "", "", 0, false
		}
		name, format = splitFormat(s[i+2 : i+j])
		if !braceNameRe.MatchString(name) || !fmtRe.MatchString(format) {
			return "", "", 0, false
		}
		return name, format, i + j + 1, true
	case strings.HasPrefix(s[i:], "[["):
		j := strings.Index(s[i:], "]]")
		if j < 0 {
			return "", "", 0, false
		}
		name, format = splitFormat(s[i+2 : i+j])
		if !braceNameRe.MatchString(name) || !fmtRe.MatchString(format) {
			return "", "", 0, false
		}
		return name, format, i + j + 2, true
	case s[i] == '$':
		m := wordRe.FindString(s[i+1:])
		if m == "" {
			return "", "", 0, false
		}
		return m, "", i + 1 + len(m), true
	}
	return "", "", 0, false
}

func splitFormat(inner string) (string, string) {
	name, format, _ := strings.Cut(inner, ":")
	return name, format
}

func quoteSQL(v string) string {
	return "'" + strings.ReplaceAll(v, "'", "''") + "'"
}

// compile turns template SQL into an anchored pattern, returning the number of caller slots per field.
func compile(sql string, vars map[string]Variable) (pattern string, counts [fieldCount]int, err error) {
	if containsExecutableComment(sql) {
		return "", counts, errors.New("executable comment /*! is not allowed")
	}
	var pat, lit strings.Builder
	var lx lexer
	flush := func() {
		if lit.Len() == 0 {
			return
		}
		lx.feed(lit.String())
		pat.WriteString(regexp.QuoteMeta(lit.String()))
		lit.Reset()
	}
	i := 0
	for i < len(sql) {
		if sql[i] != '$' && sql[i] != '[' {
			lit.WriteByte(sql[i])
			i++
			continue
		}
		name, format, end, ok := parseSlot(sql, i)
		if !ok {
			lit.WriteByte(sql[i])
			i++
			continue
		}
		slotText := sql[i:end]
		if backendMacros[name] && end < len(sql) && sql[end] == '(' {
			lit.WriteString(slotText)
			i = end
			continue
		}
		plan, err := resolveSlot(name, format, vars)
		if err != nil {
			return "", counts, fmt.Errorf("%s: %w", slotText, err)
		}
		if plan.kind == slotLiteral || plan.kind == slotUnknown {
			if plan.kind == slotUnknown {
				plan.text = slotText
			}
			lit.WriteString(plan.text)
			i = end
			continue
		}
		if plan.kind == slotPattern && plan.canBeEmpty && strings.HasSuffix(lit.String(), "-") && lx.state == stateNormal {
			return "", counts, fmt.Errorf("%s: slot directly after a dash", slotText)
		}
		flush()
		if lx.pendingEsc {
			return "", counts, fmt.Errorf("%s: slot directly after a backslash escape", slotText)
		}
		if plan.kind == slotOptions {
			next, err := feedOptions(lx, plan.options)
			if err != nil {
				return "", counts, fmt.Errorf("%s: %w", slotText, err)
			}
			lx = next
			pat.WriteString(plan.pattern)
			i = end
			continue
		}
		if lx.state != plan.need {
			return "", counts, fmt.Errorf("%s: slot not allowed in this SQL context", slotText)
		}
		if plan.kind == slotCaller {
			pat.WriteString(fmt.Sprintf("(?P<%s%d>%s)", callerSlots[plan.field].group, counts[plan.field], patQStr))
			counts[plan.field]++
		} else {
			pat.WriteString(plan.pattern)
		}
		i = end
	}
	flush()
	return "(?s)^" + pat.String() + "$", counts, nil
}

// feedOptions feeds each literal option through a copy of the lexer and requires one common end state.
func feedOptions(lx lexer, options []string) (lexer, error) {
	var result lexer
	for n, opt := range options {
		c := lx
		c.feed(opt)
		if n == 0 {
			result = c
		} else if c != result {
			return lexer{}, errors.New("options leave the SQL context in different states")
		}
	}
	return result, nil
}

func resolveSlot(name, format string, vars map[string]Variable) (slotPlan, error) {
	for field, cs := range callerSlots {
		if name != cs.name {
			continue
		}
		if format != "sqlstring" {
			return slotPlan{}, fmt.Errorf("%s requires the sqlstring format", cs.name)
		}
		return slotPlan{kind: slotCaller, field: callerField(field), need: stateNormal}, nil
	}
	v, found := vars[name]
	if !found {
		if strings.HasPrefix(name, "__") {
			return slotPlan{}, errors.New("unsupported built-in variable")
		}
		return slotPlan{kind: slotUnknown}, nil
	}
	switch {
	case v.Type == "constant":
		switch format {
		case "", "raw":
			return slotPlan{kind: slotLiteral, text: v.Query}, nil
		case "sqlstring":
			return slotPlan{kind: slotLiteral, text: quoteSQL(v.Query)}, nil
		}
		return slotPlan{}, fmt.Errorf("unsupported format %q for a constant variable", format)
	case v.Type == "custom" && !v.Multi && !v.IncludeAll:
		return resolveCustom(v, format)
	case v.Type == "query" || v.Type == "custom":
		if v.Multi || v.IncludeAll {
			return resolveList(v, format)
		}
		return resolveSingle(v, format)
	case v.Type == "textbox":
		return resolveSingle(v, format)
	}
	return slotPlan{}, fmt.Errorf("unsupported variable type %q", v.Type)
}

func resolveCustom(v Variable, format string) (slotPlan, error) {
	opts := customOptions(v)
	if len(opts) == 0 {
		return slotPlan{}, errors.New("custom variable has no options")
	}
	for _, o := range opts {
		for _, bad := range []string{"'", `"`, "`", `\`, "#", "--", "/*"} {
			if strings.Contains(o, bad) {
				return slotPlan{}, fmt.Errorf("custom option %q contains %q", o, bad)
			}
		}
	}
	var fed, quoted []string
	for _, o := range opts {
		switch format {
		case "", "raw":
			fed = append(fed, o)
		case "sqlstring":
			fed = append(fed, quoteSQL(o))
		default:
			return slotPlan{}, fmt.Errorf("unsupported format %q for a custom variable", format)
		}
		quoted = append(quoted, regexp.QuoteMeta(fed[len(fed)-1]))
	}
	return slotPlan{kind: slotOptions, options: fed, pattern: "(?:" + strings.Join(quoted, "|") + ")"}, nil
}

func customOptions(v Variable) []string {
	if len(v.Options) > 0 {
		return v.Options
	}
	var out []string
	for _, part := range strings.Split(v.Query, ",") {
		if k := strings.LastIndex(part, " : "); k >= 0 {
			part = part[k+3:]
		}
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, part)
		}
	}
	return out
}

func resolveList(v Variable, format string) (slotPlan, error) {
	var p slotPlan
	switch format {
	case "", "sqlstring":
		p = slotPlan{kind: slotPattern, pattern: patQList, need: stateNormal, canBeEmpty: true}
	case "regex":
		p = slotPlan{kind: slotPattern, pattern: patRegexAny, need: stateSingleQuoted}
	default:
		return slotPlan{}, fmt.Errorf("unsupported format %q for a multi-value variable", format)
	}
	if v.AllValue != "" {
		p.pattern = "(?:" + p.pattern + "|" + regexp.QuoteMeta(v.AllValue) + ")"
	}
	return p, nil
}

func resolveSingle(v Variable, format string) (slotPlan, error) {
	switch format {
	case "sqlstring":
		return slotPlan{kind: slotPattern, pattern: patQStr, need: stateNormal}, nil
	case "regex":
		return slotPlan{kind: slotPattern, pattern: patRegexLst, need: stateSingleQuoted}, nil
	case "":
		return slotPlan{kind: slotPattern, pattern: patInner, need: stateSingleQuoted}, nil
	}
	return slotPlan{}, fmt.Errorf("unsupported format %q for variable %q", format, v.Name)
}
