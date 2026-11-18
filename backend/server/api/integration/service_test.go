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

package integration

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
)

var fixedNow = time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)

// query is one recorded All call.
type query struct {
	sel, from, where string
	params           []interface{}
}

// fakeDB answers All calls by matching the SELECT text, and records every call.
type fakeDB struct {
	t       *testing.T
	db      *dalmocks.Dal
	answers map[string]map[string]interface{} // select-text fragment -> column values of the single row
	lists   map[string][]map[string]interface{}
	queries []query
}

func newFakeDB(t *testing.T) *fakeDB {
	t.Helper()
	f := &fakeDB{t: t, db: dalmocks.NewDal(t), answers: map[string]map[string]interface{}{}, lists: map[string][]map[string]interface{}{}}
	// Queries pass two to five clauses (Select, From, then optionally Where, Groupby and Orderby).
	for clauses := 2; clauses <= 5; clauses++ {
		args := make([]interface{}, clauses+1)
		for i := range args {
			args[i] = mock.Anything
		}
		f.db.On("All", args...).Run(f.serve).Return(nil).Maybe()
	}
	return f
}

func (f *fakeDB) serve(args mock.Arguments) {
	var q query
	for _, arg := range args[1:] {
		clause := arg.(dal.Clause)
		switch data := clause.Data.(type) {
		case dal.DalClause:
			switch clause.Type {
			case dal.SelectClause:
				q.sel = data.Expr
			case dal.FromClause:
				q.from = data.Expr
			case dal.WhereClause:
				q.where = data.Expr
			}
			q.params = append(q.params, data.Params...)
		case string:
			if clause.Type == dal.FromClause {
				q.from = data
			}
		}
	}
	f.queries = append(f.queries, q)
	for fragment, rows := range f.lists {
		if strings.Contains(q.sel, fragment) {
			for _, row := range rows {
				appendRow(f.t, args[0], row)
			}
			return
		}
	}
	for fragment, row := range f.answers {
		if strings.Contains(q.sel, fragment) {
			appendRow(f.t, args[0], row)
			return
		}
	}
}

// appendRow appends one element to the slice dst points to, setting the named fields.
func appendRow(t *testing.T, dst interface{}, values map[string]interface{}) {
	t.Helper()
	slice := reflect.ValueOf(dst).Elem()
	row := reflect.New(slice.Type().Elem()).Elem()
	for name, value := range values {
		field := row.FieldByName(name)
		if !field.IsValid() {
			t.Fatalf("row type %s has no field %s", row.Type(), name)
		}
		field.Set(reflect.ValueOf(value))
	}
	slice.Set(reflect.Append(slice, row))
}

func newService(t *testing.T, db rowsReader) *StatsService {
	t.Helper()
	s, err := NewStatsService(db, WithClock(func() time.Time { return fixedNow }))
	if err != nil {
		t.Fatalf("NewStatsService() error = %v", err)
	}
	return s
}

func TestNewStatsServiceRejectsNilDependencies(t *testing.T) {
	if _, err := NewStatsService(nil); err == nil {
		t.Error("NewStatsService(nil) = nil error, want error")
	}
	if _, err := NewStatsService(dalmocks.NewDal(t), WithClock(nil)); err == nil {
		t.Error("NewStatsService(WithClock(nil)) = nil error, want error")
	}
}

func TestStatsServiceValidatesInputBeforeQuerying(t *testing.T) {
	tests := []struct {
		name, email, tf, wantField string
	}{
		{"bad email", "not-an-email", "1d", "email"},
		{"display name", "Abc <abc@arbisoft.com>", "1d", "email"},
		{"empty email", "", "1d", "email"},
		{"bad tf", "abc@arbisoft.com", "1D", "tf"},
		{"missing tf", "abc@arbisoft.com", "", "tf"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			db := newFakeDB(t)
			s := newService(t, db.db)
			calls := []func() errors.Error{
				func() errors.Error { _, err := s.Jira(tc.email, Period{TimeFrame: tc.tf}); return err },
				func() errors.Error { _, err := s.GitHub(tc.email, Period{TimeFrame: tc.tf}); return err },
				func() errors.Error { _, err := s.AIUsage(tc.email, Period{TimeFrame: tc.tf}); return err },
				func() errors.Error { _, err := s.AICost(tc.email, Period{TimeFrame: tc.tf}); return err },
			}
			for _, call := range calls {
				err := call()
				if err == nil || err.GetType().GetHttpCode() != 400 || !strings.Contains(err.Error(), tc.wantField) {
					t.Errorf("error = %v, want a 400 naming %q", err, tc.wantField)
				}
			}
			if len(db.queries) != 0 {
				t.Errorf("ran %d queries for invalid input, want 0", len(db.queries))
			}
		})
	}
}

func TestJiraMapsRowsAndBindsTheWindow(t *testing.T) {
	db := newFakeDB(t)
	db.answers["issues_resolved"] = map[string]interface{}{"IssuesResolved": int64(4), "StoryPointsResolved": 7.5, "IssuesInProgress": int64(2), "IssuesTodo": int64(3), "AvgResolutionHours": 36.5}
	db.lists["resolved_count"] = []map[string]interface{}{{"IssuesResolved": int64(4), "StoryPoints": 7.5}}
	db.answers["issues_created"] = map[string]interface{}{"IssuesCreated": int64(5)}

	got, err := newService(t, db.db).Jira(" ABC@Arbisoft.com ", Period{TimeFrame: "1w"})
	if err != nil {
		t.Fatalf("Jira() error = %v", err)
	}

	from := fixedNow.AddDate(0, 0, -7)
	want := &JiraStats{StatsWindow: StatsWindow{Email: "abc@arbisoft.com", TimeFrame: "1w", From: from, To: fixedNow},
		IssuesResolved: 4, StoryPointsResolved: 7.5, IssuesCreated: 5, IssuesInProgress: 2, IssuesTodo: 3, AvgResolutionHours: 36.5,
		ByType: []JiraTypeStats{{IssuesResolved: 4, StoryPoints: 7.5}}, ByTeam: []JiraTeamStats{{IssuesResolved: 4, StoryPoints: 7.5}}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Jira() = %+v, want %+v", got, want)
	}
	if len(db.queries) != 4 {
		t.Fatalf("queries = %d, want 4", len(db.queries))
	}
	for _, q := range db.queries {
		if !containsParam(q.params, "abc@arbisoft.com") || !containsParam(q.params, from) || !containsParam(q.params, fixedNow) {
			t.Errorf("query %q params = %v, want the lowercased email and the window", q.sel, q.params)
		}
		if !strings.Contains(q.where+q.from, "jira:%") || !strings.Contains(q.where+q.from, "LOWER(a.email) = ?") {
			t.Errorf("where = %q, want jira issues matched on the lowercased account email", q.where)
		}
	}
}

func TestStatsWithNoDataAreZeroAndNeverNull(t *testing.T) {
	db := newFakeDB(t) // answers nothing: every slice stays empty
	s := newService(t, db.db)

	jira, err := s.Jira("abc@arbisoft.com", Period{TimeFrame: "24h"})
	if err != nil || jira.IssuesResolved != 0 || jira.IssuesCreated != 0 {
		t.Errorf("Jira() = %+v, %v; want zeros", jira, err)
	}
	github, err := s.GitHub("abc@arbisoft.com", Period{TimeFrame: "24h"})
	if err != nil || github.Commits != 0 || github.Reviews != 0 || github.ReviewComments != 0 || github.PullRequestsReviewed != 0 {
		t.Errorf("GitHub() = %+v, %v; want zeros", github, err)
	}
	usage, err := s.AIUsage("abc@arbisoft.com", Period{TimeFrame: "24h"})
	if err != nil || usage.Providers == nil || len(usage.Providers) != 0 || usage.Monthly == nil || len(usage.Monthly) != 0 {
		t.Errorf("AIUsage() = %#v, %v; want empty, non-nil providers and monthly", usage, err)
	}
	cost, err := s.AICost("abc@arbisoft.com", Period{TimeFrame: "24h"})
	if err != nil || cost.Models == nil || len(cost.Models) != 0 || cost.TotalEstimatedCostUSD != "0.00000000" {
		t.Errorf("AICost() = %+v, %v; want empty models and a zero total", cost, err)
	}
}

func TestGitHubMapsEveryQuery(t *testing.T) {
	db := newFakeDB(t)
	db.answers["COUNT(*) AS commits"] = map[string]interface{}{"Commits": int64(9), "Additions": int64(120), "Deletions": int64(30)}
	db.answers["pull_requests_opened"] = map[string]interface{}{"PullRequestsOpened": int64(2), "PullRequestsMerged": int64(1)}
	db.answers["pull_requests_with_commits"] = map[string]interface{}{"PullRequestsWithCommits": int64(3)}
	db.answers["AS reviews"] = map[string]interface{}{"Reviews": int64(6)}

	got, err := newService(t, db.db).GitHub("abc@arbisoft.com", Period{TimeFrame: "30d"})
	if err != nil {
		t.Fatalf("GitHub() error = %v", err)
	}
	if got.Commits != 9 || got.Additions != 120 || got.Deletions != 30 || got.PullRequestsOpened != 2 ||
		got.PullRequestsMerged != 1 || got.PullRequestsWithCommits != 3 || got.Reviews != 6 {
		t.Errorf("GitHub() = %+v", got)
	}
	for _, q := range db.queries {
		if !strings.Contains(q.where+q.from, "github:%") {
			t.Errorf("query %q isn't limited to GitHub", q.sel)
		}
	}
}

func TestAIUsageAndCostUseWholeDays(t *testing.T) {
	db := newFakeDB(t)
	db.lists["active_days"] = []map[string]interface{}{
		{"Provider": "claude", "ActiveDays": int64(2), "LinesAdded": int64(50)},
		{"Provider": "cursor", "ActiveDays": int64(1), "Acceptances": int64(4)},
	}
	db.answers["tool_edits_accepted"] = map[string]interface{}{"ToolEditsAccepted": int64(8), "ToolEditsRejected": int64(1)}
	db.lists["AS estimated_cost_usd"] = []map[string]interface{}{
		{"Provider": "claude", "Model": "claude-sonnet-5", "InputTokens": int64(10), "EstimatedCostUSD": "1.25000000"},
	}
	db.answers["total_estimated_cost_usd"] = map[string]interface{}{"TotalEstimatedCostUsd": "1.25000000"}
	s := newService(t, db.db)

	usage, err := s.AIUsage("abc@arbisoft.com", Period{TimeFrame: "24h"})
	if err != nil {
		t.Fatalf("AIUsage() error = %v", err)
	}
	if len(usage.Providers) != 2 || usage.Providers[0].LinesAdded != 50 || usage.ToolEditsAccepted != 8 || usage.ToolEditsRejected != 1 {
		t.Errorf("AIUsage() = %+v", usage)
	}
	cost, err := s.AICost("abc@arbisoft.com", Period{TimeFrame: "24h"})
	if err != nil {
		t.Fatalf("AICost() error = %v", err)
	}
	if len(cost.Models) != 1 || cost.Models[0].EstimatedCostUSD != "1.25000000" || cost.TotalEstimatedCostUSD != "1.25000000" {
		t.Errorf("AICost() = %+v", cost)
	}
	for _, q := range db.queries {
		if !containsParam(q.params, "2026-11-09") || !containsParam(q.params, "2026-11-10") {
			t.Errorf("query %q params = %v, want the day range 2026-11-09..2026-11-10", q.sel, q.params)
		}
	}
}

func TestQueryErrorsAreWrapped(t *testing.T) {
	db := dalmocks.NewDal(t)
	db.On("All", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(errors.Default.New("connection refused"))

	_, err := newService(t, db).GitHub("abc@arbisoft.com", Period{TimeFrame: "1d"})

	if err == nil || !strings.Contains(err.Error(), "read github commits") {
		t.Errorf("GitHub() error = %v, want it wrapped with the query it was running", err)
	}
}

func containsParam(params []interface{}, want interface{}) bool {
	for _, p := range params {
		if reflect.DeepEqual(p, want) {
			return true
		}
	}
	return false
}

func TestSinceJoiningStartsAtTheFirstActivity(t *testing.T) {
	joined := time.Date(2025, 3, 4, 9, 0, 0, 0, time.UTC)
	db := newFakeDB(t)
	db.lists["AS joined"] = []map[string]interface{}{{"Joined": &joined}}

	got, err := newService(t, db.db).Jira("ABC@arbisoft.com", Period{Since: "joining"})
	if err != nil {
		t.Fatalf("Jira() error = %v", err)
	}
	if got.Since != "joining" || got.TimeFrame != "" || !got.From.Equal(joined) || !got.To.Equal(fixedNow) {
		t.Errorf("window = %+v, want joining %v .. %v", got.StatsWindow, joined, fixedNow)
	}
	// The window is longer than a year, which only since=joining may do.
	if got.To.Sub(got.From) <= maxRange {
		t.Errorf("window = %v, want longer than the explicit range limit", got.To.Sub(got.From))
	}
}

func TestSinceJoiningWithoutActivityIsAnEmptyWindow(t *testing.T) {
	got, err := newService(t, newFakeDB(t).db).AICost("abc@arbisoft.com", Period{Since: "joining"})
	if err != nil {
		t.Fatalf("AICost() error = %v", err)
	}
	if !got.From.Equal(fixedNow) || !got.To.Equal(fixedNow) || got.TotalEstimatedCostUSD != zeroCost {
		t.Errorf("AICost() = %+v, want an empty window at now and zero cost", got)
	}
}

func TestSinceRejectsOtherValuesAndCombinations(t *testing.T) {
	for name, p := range map[string]Period{
		"unknown value": {Since: "start"},
		"with tf":       {Since: "joining", TimeFrame: "1y"},
		"with range":    {Since: "joining", From: "2026-11-01T00:00:00Z", To: "2026-11-08T00:00:00Z"},
	} {
		t.Run(name, func(t *testing.T) {
			db := newFakeDB(t)
			_, err := newService(t, db.db).GitHub("abc@arbisoft.com", p)
			if err == nil || err.GetType().GetHttpCode() != 400 || len(db.queries) != 0 {
				t.Errorf("error = %v with %d queries, want a 400 before any query", err, len(db.queries))
			}
		})
	}
}

func TestGitHubBreakdownComputesTheShareOfEveryContributor(t *testing.T) {
	db := newFakeDB(t)
	db.lists["AS repo_commits"] = []map[string]interface{}{
		{"Name": "org/a", "RepoCommits": int64(20), "RepoLines": int64(1000), "Contributors": int64(4), "Commits": int64(5), "LineChanged": int64(250)},
		{"Name": "org/b", "RepoCommits": int64(3), "RepoLines": int64(0), "Contributors": int64(1), "Commits": int64(3), "LineChanged": int64(0)},
	}
	db.lists["AS repo_opened"] = []map[string]interface{}{
		{"Name": "org/a", "RepoOpened": int64(8), "RepoMerged": int64(4), "Opened": int64(2), "Merged": int64(1)},
		{"Name": "org/c", "RepoOpened": int64(1), "RepoMerged": int64(0), "Opened": int64(1)},
	}
	db.answers["AS avg_pr_merge_hours"] = map[string]interface{}{"AvgPrMergeHours": 4.5}
	db.answers["pull_requests_reviewed"] = map[string]interface{}{"Reviews": int64(6), "ReviewComments": int64(4), "PullRequestsReviewed": int64(3)}

	got, err := newService(t, db.db).GitHub("abc@arbisoft.com", Period{TimeFrame: "1y"})
	if err != nil {
		t.Fatalf("GitHub() error = %v", err)
	}
	want := []GitHubBreakdown{
		{Name: "org/a", Commits: 5, LinesChanged: 250, PullRequestsOpened: 2, PullRequestsMerged: 1, RepoCommits: 20, RepoLinesChanged: 1000,
			RepoPullRequestsMerged: 4, Contributors: 4, CommitSharePct: 25, LinesSharePct: 25, PullRequestsMergedSharePct: 25},
		{Name: "org/b", Commits: 3, RepoCommits: 3, Contributors: 1, CommitSharePct: 100},
		{Name: "org/c", PullRequestsOpened: 1},
	}
	if !reflect.DeepEqual(got.ByRepo, want) || !reflect.DeepEqual(got.ByTeam, want) {
		t.Errorf("ByRepo = %+v, ByTeam = %+v, want %+v", got.ByRepo, got.ByTeam, want)
	}
	if got.AvgPrMergeHours != 4.5 || got.PullRequestsReviewed != 3 || got.Reviews != 6 || got.ReviewComments != 4 {
		t.Errorf("GitHub() = %+v", got)
	}
}

func TestSharePct(t *testing.T) {
	for _, tc := range []struct {
		part, total int64
		want        float64
	}{{1, 3, 33.3}, {2, 3, 66.7}, {0, 0, 0}, {5, 0, 0}, {7, 7, 100}} {
		if got := sharePct(tc.part, tc.total); got != tc.want {
			t.Errorf("sharePct(%d, %d) = %v, want %v", tc.part, tc.total, got, tc.want)
		}
	}
}

func TestAIMonthlyTrendsAndActiveFlag(t *testing.T) {
	db := newFakeDB(t)
	db.lists["days_active"] = []map[string]interface{}{
		{"Provider": "claude", "Month": "2026-10", "ActiveDays": int64(3), "Sessions": int64(9), "Suggestions": int64(640), "Acceptances": int64(210)},
		{"Provider": "claude", "Month": "2026-11", "ActiveDays": int64(1)},
	}
	db.lists["AS cost_usd"] = []map[string]interface{}{{"Month": "2026-10", "InputTokens": int64(5), "CostUSD": "2.50000000"}}
	s := newService(t, db.db)

	usage, err := s.AIUsage("abc@arbisoft.com", Period{TimeFrame: "30d"})
	if err != nil {
		t.Fatalf("AIUsage() error = %v", err)
	}
	if len(usage.Monthly) != 2 || usage.Monthly[0].ActiveDays != 3 || usage.Monthly[0].Suggestions != 640 ||
		usage.Monthly[0].Acceptances != 210 || !usage.ActiveInLastMonth {
		t.Errorf("AIUsage() = %+v, want two months and active in the month the window ends", usage)
	}
	cost, err := s.AICost("abc@arbisoft.com", Period{TimeFrame: "30d"})
	if err != nil {
		t.Fatalf("AICost() error = %v", err)
	}
	if len(cost.Monthly) != 1 || cost.Monthly[0].CostUSD != "2.50000000" {
		t.Errorf("AICost().Monthly = %+v", cost.Monthly)
	}
}

func TestGitHubReviewQueryCountsWorkOnOtherPeoplesPullRequests(t *testing.T) {
	db := newFakeDB(t)

	if _, err := newService(t, db.db).GitHub("ABC@arbisoft.com", Period{TimeFrame: "1w"}); err != nil {
		t.Fatalf("GitHub() error = %v", err)
	}

	q, ok := findQuery(db.queries, "AS reviews")
	if !ok {
		t.Fatal("no query selects the reviews")
	}
	sql := q.sel + " FROM " + q.from + " WHERE " + q.where
	for _, want := range []string{
		"CASE WHEN pc.type = 'REVIEW' THEN pc.id END) AS reviews",
		"CASE WHEN pc.type IN ('NORMAL', 'DIFF') THEN pc.id END) AS review_comments",
		"COUNT(DISTINCT pc.pull_request_id) AS pull_requests_reviewed",
		"pc.type IN ('REVIEW', 'NORMAL', 'DIFF')",
		"JOIN pull_requests p ON p.id = pc.pull_request_id",
		"LEFT JOIN accounts pa ON pa.id = p.author_id",
		"(pa.email IS NULL OR LOWER(pa.email) <> ?)",
	} {
		if !strings.Contains(sql, want) {
			t.Errorf("query %q doesn't contain %q", sql, want)
		}
	}
	if got := countParam(q.params, "abc@arbisoft.com"); got != 2 {
		t.Errorf("params = %v hold the lowercased email %d times, want 2", q.params, got)
	}
	from := fixedNow.AddDate(0, 0, -7)
	if !containsParam(q.params, from) || !containsParam(q.params, fixedNow) {
		t.Errorf("params = %v, want the window %v .. %v", q.params, from, fixedNow)
	}
}

func TestGitHubReviewQueryErrorIsWrapped(t *testing.T) {
	db := dalmocks.NewDal(t)
	db.On("All", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(
		func(_ interface{}, clauses ...dal.Clause) errors.Error {
			if strings.Contains(selectText(clauses), "review_comments") {
				return errors.Default.New("connection refused")
			}
			return nil
		})

	_, err := newService(t, db).GitHub("abc@arbisoft.com", Period{TimeFrame: "1d"})

	if err == nil || !strings.Contains(err.Error(), "read github reviews") {
		t.Errorf("GitHub() error = %v, want it wrapped with the reviews query", err)
	}
}

func TestAIMonthlySelectsSuggestionsAndAcceptances(t *testing.T) {
	db := newFakeDB(t)

	if _, err := newService(t, db.db).AIUsage("abc@arbisoft.com", Period{TimeFrame: "30d"}); err != nil {
		t.Fatalf("AIUsage() error = %v", err)
	}

	q, ok := findQuery(db.queries, "days_active")
	if !ok {
		t.Fatal("no monthly query ran")
	}
	for _, want := range []string{"SUM(suggestions_count), 0) AS suggestions", "SUM(acceptance_count), 0) AS acceptances"} {
		if !strings.Contains(q.sel, want) {
			t.Errorf("monthly select %q doesn't contain %q", q.sel, want)
		}
	}
}

// findQuery returns the first recorded query whose SELECT contains fragment.
func findQuery(queries []query, fragment string) (query, bool) {
	for _, q := range queries {
		if strings.Contains(q.sel, fragment) {
			return q, true
		}
	}
	return query{}, false
}

// countParam counts the params equal to want.
func countParam(params []interface{}, want interface{}) int {
	n := 0
	for _, p := range params {
		if reflect.DeepEqual(p, want) {
			n++
		}
	}
	return n
}

// selectText returns the SELECT expression among clauses, or "" without one.
func selectText(clauses []dal.Clause) string {
	for _, c := range clauses {
		if data, ok := c.Data.(dal.DalClause); ok && c.Type == dal.SelectClause {
			return data.Expr
		}
	}
	return ""
}
