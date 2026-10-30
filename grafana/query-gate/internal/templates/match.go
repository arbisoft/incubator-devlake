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
	"regexp"
	"sort"
)

// Reason says why a query was not accepted.
type Reason string

const (
	ReasonNoMatch       Reason = "no saved query matches"
	ReasonLoginMismatch Reason = "login does not match the caller"
	ReasonEmailMismatch Reason = "email does not match the caller"
	ReasonNoLoginSlot   Reason = "saved query has no login filter"
)

// Caller is the signed-in user a query is matched for.
type Caller struct {
	Login, Email string
}

// Template is one compiled saved query.
type Template struct {
	Location string
	HasLogin bool
	// AllProjects is set when the dashboard is tagged devlake:all-projects.
	AllProjects bool
	re          *regexp.Regexp
	groups      [fieldCount][]int
}

// Set is an ordered collection of compiled templates.
type Set struct {
	templates []*Template
}

// MatchResult is the outcome of matching one SQL string.
type MatchResult struct {
	Accepted bool
	Location string
	Reason   Reason
}

func newTemplate(location, sql string, vars map[string]Variable) (*Template, error) {
	pattern, counts, err := compile(sql, vars)
	if err != nil {
		return nil, err
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		return nil, fmt.Errorf("compiled pattern is invalid: %w", err)
	}
	t := &Template{Location: location, HasLogin: counts[fieldLogin] > 0, re: re}
	for field, cs := range callerSlots {
		for n := 0; n < counts[field]; n++ {
			t.groups[field] = append(t.groups[field], re.SubexpIndex(fmt.Sprintf("%s%d", cs.group, n)))
		}
	}
	return t, nil
}

// NewSet concatenates template lists, in order, into one set.
func NewSet(parts ...[]*Template) *Set {
	s := &Set{}
	for _, p := range parts {
		s.templates = append(s.templates, p...)
	}
	return s
}

// Templates returns a copy of the set's template list.
func (s *Set) Templates() []*Template { return append([]*Template(nil), s.templates...) }

// Len returns the number of templates.
func (s *Set) Len() int { return len(s.templates) }

// NoLogin returns the sorted locations of templates without a login slot.
func (s *Set) NoLogin() []string {
	var out []string
	for _, t := range s.templates {
		if !t.HasLogin && !t.AllProjects {
			out = append(out, t.Location)
		}
	}
	sort.Strings(out)
	return out
}

func rank(r Reason) int {
	switch r {
	case ReasonLoginMismatch, ReasonEmailMismatch:
		return 3
	case ReasonNoLoginSlot:
		return 2
	}
	return 1
}

// Match accepts sql only when a template matches it with every login and email slot holding the caller's values.
func (s *Set) Match(sql string, c Caller) MatchResult {
	want := [fieldCount]string{fieldLogin: quoteSQL(c.Login), fieldEmail: quoteSQL(c.Email)}
	reasons := [fieldCount]Reason{fieldLogin: ReasonLoginMismatch, fieldEmail: ReasonEmailMismatch}
	best := MatchResult{Reason: ReasonNoMatch}
	for _, t := range s.templates {
		m := t.re.FindStringSubmatchIndex(sql)
		if m == nil {
			continue
		}
		if !t.HasLogin && t.AllProjects {
			return MatchResult{Accepted: true, Location: t.Location}
		}
		reason := ReasonNoLoginSlot
		if t.HasLogin {
			reason = firstMismatch(sql, m, t, want, reasons)
			if reason == "" {
				return MatchResult{Accepted: true, Location: t.Location}
			}
		}
		if rank(reason) > rank(best.Reason) {
			best = MatchResult{Location: t.Location, Reason: reason}
		}
	}
	return best
}

// firstMismatch checks login groups before email groups and returns the reason for the first wrong one, or "".
func firstMismatch(sql string, m []int, t *Template, want [fieldCount]string, reasons [fieldCount]Reason) Reason {
	for field, groups := range t.groups {
		for _, g := range groups {
			if sql[m[2*g]:m[2*g+1]] != want[field] {
				return reasons[field]
			}
		}
	}
	return ""
}
