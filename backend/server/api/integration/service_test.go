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

	"github.com/apache/incubator-devlake/core/errors"
)

var fixedNow = time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)

// call is one recorded repository call: the method, the email and the window or day range it was given.
type call struct {
	method, email string
	args          []interface{}
}

// fakeRepos implements every repository interface with canned answers, records each call, and fails the method
// named in failOn.
type fakeRepos struct {
	joined       *time.Time
	assigned     JiraAssignedCounts
	created      int64
	byType       []JiraTypeRow
	byTeam       []JiraTeamRow
	commits      GitHubCommitCounts
	authored     GitHubAuthoredCounts
	withCommits  int64
	reviews      GitHubReviewCounts
	commitGroups map[GitHubGroup][]GitHubCommitGroupRow
	prGroups     map[GitHubGroup][]GitHubPullRequestGroupRow
	providers    []AIProviderRow
	decisions    AIToolDecisionCounts
	monthly      []AIMonthlyRow
	modelCosts   []AIModelCostRow
	totalCost    string
	monthlyCosts []AIMonthlyCostRow
	failOn       string
	calls        []call
}

var (
	_ activityReader = (*fakeRepos)(nil)
	_ jiraReader     = (*fakeRepos)(nil)
	_ githubReader   = (*fakeRepos)(nil)
	_ aiReader       = (*fakeRepos)(nil)
)

// errRepo is the error a failing fake method returns.
var errRepo = errors.Default.New("read something: connection refused")

func (f *fakeRepos) record(method, email string, args ...interface{}) errors.Error {
	f.calls = append(f.calls, call{method: method, email: email, args: args})
	if f.failOn == method {
		return errRepo
	}
	return nil
}

func (f *fakeRepos) FirstActivity(email string) (*time.Time, errors.Error) {
	return f.joined, f.record("FirstActivity", email)
}

func (f *fakeRepos) Assigned(email string, from, to time.Time) (JiraAssignedCounts, errors.Error) {
	return f.assigned, f.record("Assigned", email, from, to)
}

func (f *fakeRepos) Created(email string, from, to time.Time) (int64, errors.Error) {
	return f.created, f.record("Created", email, from, to)
}

func (f *fakeRepos) ResolvedByType(email string, from, to time.Time) ([]JiraTypeRow, errors.Error) {
	return f.byType, f.record("ResolvedByType", email, from, to)
}

func (f *fakeRepos) ResolvedByTeam(email string, from, to time.Time) ([]JiraTeamRow, errors.Error) {
	return f.byTeam, f.record("ResolvedByTeam", email, from, to)
}

func (f *fakeRepos) Commits(email string, from, to time.Time) (GitHubCommitCounts, errors.Error) {
	return f.commits, f.record("Commits", email, from, to)
}

func (f *fakeRepos) Authored(email string, from, to time.Time) (GitHubAuthoredCounts, errors.Error) {
	return f.authored, f.record("Authored", email, from, to)
}

func (f *fakeRepos) PullRequestsWithCommits(email string, from, to time.Time) (int64, errors.Error) {
	return f.withCommits, f.record("PullRequestsWithCommits", email, from, to)
}

func (f *fakeRepos) Reviews(email string, from, to time.Time) (GitHubReviewCounts, errors.Error) {
	return f.reviews, f.record("Reviews", email, from, to)
}

func (f *fakeRepos) CommitsByGroup(email string, from, to time.Time, group GitHubGroup) ([]GitHubCommitGroupRow, errors.Error) {
	return f.commitGroups[group], f.record("CommitsByGroup", email, from, to, group)
}

func (f *fakeRepos) PullRequestsByGroup(email string, from, to time.Time, group GitHubGroup) ([]GitHubPullRequestGroupRow, errors.Error) {
	return f.prGroups[group], f.record("PullRequestsByGroup", email, from, to, group)
}

func (f *fakeRepos) Providers(email, firstDay, lastDay string) ([]AIProviderRow, errors.Error) {
	return f.providers, f.record("Providers", email, firstDay, lastDay)
}

func (f *fakeRepos) ToolDecisions(email, firstDay, lastDay string) (AIToolDecisionCounts, errors.Error) {
	return f.decisions, f.record("ToolDecisions", email, firstDay, lastDay)
}

func (f *fakeRepos) Monthly(email, firstDay, lastDay string) ([]AIMonthlyRow, errors.Error) {
	return f.monthly, f.record("Monthly", email, firstDay, lastDay)
}

func (f *fakeRepos) ModelCosts(email, firstDay, lastDay string) ([]AIModelCostRow, errors.Error) {
	return f.modelCosts, f.record("ModelCosts", email, firstDay, lastDay)
}

func (f *fakeRepos) TotalCost(email, firstDay, lastDay string) (string, errors.Error) {
	return f.totalCost, f.record("TotalCost", email, firstDay, lastDay)
}

func (f *fakeRepos) MonthlyCosts(email, firstDay, lastDay string) ([]AIMonthlyCostRow, errors.Error) {
	return f.monthlyCosts, f.record("MonthlyCosts", email, firstDay, lastDay)
}

func newService(t *testing.T, repos *fakeRepos) *StatsService {
	t.Helper()
	s, err := NewStatsService(repos, repos, repos, repos, WithClock(func() time.Time { return fixedNow }))
	if err != nil {
		t.Fatalf("NewStatsService() error = %v", err)
	}
	return s
}

func TestNewStatsServiceRejectsNilDependencies(t *testing.T) {
	f := &fakeRepos{}
	tests := []struct {
		name     string
		activity activityReader
		jira     jiraReader
		github   githubReader
		ai       aiReader
		opts     []Option
	}{
		{name: "nil activity", jira: f, github: f, ai: f},
		{name: "nil jira", activity: f, github: f, ai: f},
		{name: "nil github", activity: f, jira: f, ai: f},
		{name: "nil ai", activity: f, jira: f, github: f},
		{name: "nil clock", activity: f, jira: f, github: f, ai: f, opts: []Option{WithClock(nil)}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := NewStatsService(tc.activity, tc.jira, tc.github, tc.ai, tc.opts...); err == nil {
				t.Error("NewStatsService() = nil error, want error")
			}
		})
	}
}

// statsCalls runs each stats method, so a test can check all four the same way.
func statsCalls(s *StatsService, email string, p Period) map[string]func() errors.Error {
	return map[string]func() errors.Error{
		"Jira":    func() errors.Error { _, err := s.Jira(email, p); return err },
		"GitHub":  func() errors.Error { _, err := s.GitHub(email, p); return err },
		"AIUsage": func() errors.Error { _, err := s.AIUsage(email, p); return err },
		"AICost":  func() errors.Error { _, err := s.AICost(email, p); return err },
	}
}

func TestStatsServiceValidatesInputBeforeReading(t *testing.T) {
	tests := []struct {
		name, email, wantField string
		p                      Period
	}{
		{"bad email", "not-an-email", "email", Period{TimeFrame: "1d"}},
		{"display name", "Abc <abc@arbisoft.com>", "email", Period{TimeFrame: "1d"}},
		{"empty email", "", "email", Period{TimeFrame: "1d"}},
		{"bad tf", "abc@arbisoft.com", "tf", Period{TimeFrame: "1D"}},
		{"missing period", "abc@arbisoft.com", "tf", Period{}},
		{"unknown since", "abc@arbisoft.com", "since", Period{Since: "start"}},
		{"since with tf", "abc@arbisoft.com", "since", Period{Since: "joining", TimeFrame: "1y"}},
		{"since with range", "abc@arbisoft.com", "since", Period{Since: "joining", From: "2026-11-01T00:00:00Z", To: "2026-11-08T00:00:00Z"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			repos := &fakeRepos{}
			for method, run := range statsCalls(newService(t, repos), tc.email, tc.p) {
				err := run()
				if err == nil || err.GetType().GetHttpCode() != 400 || !strings.Contains(err.Error(), tc.wantField) {
					t.Errorf("%s() error = %v, want a 400 naming %q", method, err, tc.wantField)
				}
			}
			if len(repos.calls) != 0 {
				t.Errorf("made %d repository calls for invalid input, want 0", len(repos.calls))
			}
		})
	}
}

func TestStatsServicePassesTheLowercasedEmailAndWindow(t *testing.T) {
	repos := &fakeRepos{}
	from := fixedNow.AddDate(0, 0, -7)
	for method, run := range statsCalls(newService(t, repos), " ABC@Arbisoft.com ", Period{TimeFrame: "1w"}) {
		if err := run(); err != nil {
			t.Fatalf("%s() error = %v", method, err)
		}
	}
	for _, c := range repos.calls {
		if c.email != "abc@arbisoft.com" {
			t.Errorf("%s got email %q, want abc@arbisoft.com", c.method, c.email)
		}
		// AI methods get the inclusive day range; the others get the exact window.
		want := []interface{}{from, fixedNow}
		if _, isDay := c.args[0].(string); isDay {
			want = []interface{}{"2026-11-03", "2026-11-10"}
		}
		if !reflect.DeepEqual(c.args[:2], want) {
			t.Errorf("%s got %v, want %v", c.method, c.args[:2], want)
		}
	}
}

func TestStatsServiceReturnsRepositoryErrorsUnchanged(t *testing.T) {
	tests := []struct{ stats, failOn string }{
		{"Jira", "Assigned"}, {"Jira", "Created"}, {"Jira", "ResolvedByType"}, {"Jira", "ResolvedByTeam"},
		{"Jira", "FirstActivity"},
		{"GitHub", "Commits"}, {"GitHub", "Authored"}, {"GitHub", "PullRequestsWithCommits"}, {"GitHub", "Reviews"},
		{"GitHub", "CommitsByGroup"}, {"GitHub", "PullRequestsByGroup"},
		{"AIUsage", "Providers"}, {"AIUsage", "ToolDecisions"}, {"AIUsage", "Monthly"},
		{"AICost", "ModelCosts"}, {"AICost", "TotalCost"}, {"AICost", "MonthlyCosts"},
	}
	for _, tc := range tests {
		t.Run(tc.stats+"/"+tc.failOn, func(t *testing.T) {
			p := Period{TimeFrame: "1d"}
			if tc.failOn == "FirstActivity" {
				p = Period{Since: sinceJoining}
			}
			err := statsCalls(newService(t, &fakeRepos{failOn: tc.failOn}), "abc@arbisoft.com", p)[tc.stats]()
			if err != errRepo {
				t.Errorf("%s() error = %v, want the repository error %v", tc.stats, err, errRepo)
			}
		})
	}
}

func TestJiraMapsTheRepositoryRows(t *testing.T) {
	repos := &fakeRepos{
		assigned: JiraAssignedCounts{IssuesResolved: 4, StoryPointsResolved: 7.5, IssuesInProgress: 2, IssuesTodo: 3, AvgResolutionHours: 36.5},
		created:  5,
		byType:   []JiraTypeRow{{IssueType: "BUG", IssuesResolved: 4, StoryPoints: 7.5}},
		byTeam:   []JiraTeamRow{{Team: "Akina", IssuesResolved: 4, StoryPoints: 7.5}},
	}

	got, err := newService(t, repos).Jira("abc@arbisoft.com", Period{TimeFrame: "1w"})
	if err != nil {
		t.Fatalf("Jira() error = %v", err)
	}

	want := &JiraStats{StatsWindow: StatsWindow{Email: "abc@arbisoft.com", TimeFrame: "1w", From: fixedNow.AddDate(0, 0, -7), To: fixedNow},
		IssuesResolved: 4, StoryPointsResolved: 7.5, IssuesCreated: 5, IssuesInProgress: 2, IssuesTodo: 3, AvgResolutionHours: 36.5,
		ByType: []JiraTypeStats{{IssueType: "BUG", IssuesResolved: 4, StoryPoints: 7.5}},
		ByTeam: []JiraTeamStats{{Team: "Akina", IssuesResolved: 4, StoryPoints: 7.5}}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Jira() = %+v, want %+v", got, want)
	}
}

func TestGitHubMapsTheRepositoryRows(t *testing.T) {
	repoRows := []GitHubCommitGroupRow{{Name: "org/a", RepoCommits: 4, Contributors: 2, EngineerCommits: 1}}
	teamRows := []GitHubCommitGroupRow{{Name: "Akina", RepoCommits: 10, Contributors: 5, EngineerCommits: 1}}
	repos := &fakeRepos{
		commits:      GitHubCommitCounts{Commits: 9, Additions: 120, Deletions: 30},
		authored:     GitHubAuthoredCounts{PullRequestsOpened: 2, PullRequestsMerged: 1, AvgPrMergeHours: 4.5},
		withCommits:  3,
		reviews:      GitHubReviewCounts{Reviews: 6, ReviewComments: 4, PullRequestsReviewed: 5},
		commitGroups: map[GitHubGroup][]GitHubCommitGroupRow{GroupByRepo: repoRows, GroupByTeam: teamRows},
	}

	got, err := newService(t, repos).GitHub("abc@arbisoft.com", Period{TimeFrame: "30d"})
	if err != nil {
		t.Fatalf("GitHub() error = %v", err)
	}

	want := &GitHubStats{StatsWindow: StatsWindow{Email: "abc@arbisoft.com", TimeFrame: "30d", From: fixedNow.AddDate(0, 0, -30), To: fixedNow},
		Commits: 9, Additions: 120, Deletions: 30, PullRequestsOpened: 2, PullRequestsMerged: 1, PullRequestsWithCommits: 3,
		Reviews: 6, ReviewComments: 4, PullRequestsReviewed: 5, AvgPrMergeHours: 4.5,
		ByRepo: []GitHubBreakdown{{Name: "org/a", Commits: 1, RepoCommits: 4, Contributors: 2, CommitSharePct: 25}},
		ByTeam: []GitHubBreakdown{{Name: "Akina", Commits: 1, RepoCommits: 10, Contributors: 5, CommitSharePct: 10}}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("GitHub() = %+v, want %+v", got, want)
	}
}

func TestMergeBreakdown(t *testing.T) {
	tests := []struct {
		name    string
		commits []GitHubCommitGroupRow
		prs     []GitHubPullRequestGroupRow
		want    []GitHubBreakdown
	}{
		{name: "no data is empty, not null", want: []GitHubBreakdown{}},
		{
			name: "commits and pull requests of a group merge, groups sort by name, shares use every contributor",
			commits: []GitHubCommitGroupRow{
				{Name: "org/b", RepoCommits: 3, Contributors: 1, EngineerCommits: 3},
				{Name: "org/a", RepoCommits: 20, RepoLines: 1000, Contributors: 4, EngineerCommits: 5, EngineerLines: 250},
			},
			prs: []GitHubPullRequestGroupRow{
				{Name: "org/a", RepoOpened: 8, RepoMerged: 4, EngineerOpened: 2, EngineerMerged: 1},
				{Name: "org/c", RepoOpened: 1, EngineerOpened: 1},
			},
			want: []GitHubBreakdown{
				{Name: "org/a", Commits: 5, LinesChanged: 250, PullRequestsOpened: 2, PullRequestsMerged: 1, RepoCommits: 20, RepoLinesChanged: 1000,
					RepoPullRequestsMerged: 4, Contributors: 4, CommitSharePct: 25, LinesSharePct: 25, PullRequestsMergedSharePct: 25},
				{Name: "org/b", Commits: 3, RepoCommits: 3, Contributors: 1, CommitSharePct: 100},
				{Name: "org/c", PullRequestsOpened: 1},
			},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := mergeBreakdown(tc.commits, tc.prs); !reflect.DeepEqual(got, tc.want) {
				t.Errorf("mergeBreakdown() = %+v, want %+v", got, tc.want)
			}
		})
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

func TestAIUsageMapsTheRepositoryRows(t *testing.T) {
	repos := &fakeRepos{
		providers: []AIProviderRow{{Provider: "copilot", ActiveDays: 2, Suggestions: 640, Acceptances: 210, CommitsByAI: 1}},
		decisions: AIToolDecisionCounts{ToolEditsAccepted: 8, ToolEditsRejected: 1},
		monthly:   []AIMonthlyRow{{Provider: "copilot", Month: "2026-10", ActiveDays: 2, Sessions: 9, Suggestions: 640, Acceptances: 210}},
	}

	got, err := newService(t, repos).AIUsage("abc@arbisoft.com", Period{TimeFrame: "30d"})
	if err != nil {
		t.Fatalf("AIUsage() error = %v", err)
	}

	want := &AIUsageStats{StatsWindow: StatsWindow{Email: "abc@arbisoft.com", TimeFrame: "30d", From: fixedNow.AddDate(0, 0, -30), To: fixedNow},
		Providers:         []AIProviderUsage{{Provider: "copilot", ActiveDays: 2, Suggestions: 640, Acceptances: 210, CommitsByAI: 1}},
		ToolEditsAccepted: 8, ToolEditsRejected: 1,
		Monthly: []AIMonthlyUsage{{Provider: "copilot", Month: "2026-10", ActiveDays: 2, Sessions: 9, Suggestions: 640, Acceptances: 210}}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("AIUsage() = %+v, want %+v", got, want)
	}
}

func TestAIUsageActiveInLastMonth(t *testing.T) {
	tests := []struct {
		name   string
		months []string
		want   bool
	}{
		{"no activity", nil, false},
		{"only earlier months", []string{"2026-09", "2026-10"}, false},
		{"activity in the month the window ends", []string{"2026-10", "2026-11"}, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			repos := &fakeRepos{}
			for _, m := range tc.months {
				repos.monthly = append(repos.monthly, AIMonthlyRow{Provider: "claude", Month: m, ActiveDays: 1})
			}
			got, err := newService(t, repos).AIUsage("abc@arbisoft.com", Period{TimeFrame: "1y"})
			if err != nil {
				t.Fatalf("AIUsage() error = %v", err)
			}
			if got.ActiveInLastMonth != tc.want {
				t.Errorf("ActiveInLastMonth = %v, want %v", got.ActiveInLastMonth, tc.want)
			}
		})
	}
}

func TestAICostMapsTheRepositoryRows(t *testing.T) {
	tests := []struct {
		name, total, wantTotal string
	}{
		{"total from the repository", "1.25000000", "1.25000000"},
		{"no total row is zero", "", zeroCost},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			repos := &fakeRepos{
				modelCosts:   []AIModelCostRow{{Provider: "claude", Model: "claude-sonnet-5", InputTokens: 10, EstimatedCostUSD: "1.25000000"}},
				totalCost:    tc.total,
				monthlyCosts: []AIMonthlyCostRow{{Month: "2026-11", InputTokens: 10, CostUSD: "1.25000000"}},
			}
			got, err := newService(t, repos).AICost("abc@arbisoft.com", Period{TimeFrame: "24h"})
			if err != nil {
				t.Fatalf("AICost() error = %v", err)
			}
			want := &AICostStats{StatsWindow: StatsWindow{Email: "abc@arbisoft.com", TimeFrame: "24h", From: fixedNow.Add(-24 * time.Hour), To: fixedNow},
				Models:                []AIModelCost{{Provider: "claude", Model: "claude-sonnet-5", InputTokens: 10, EstimatedCostUSD: "1.25000000"}},
				TotalEstimatedCostUSD: tc.wantTotal,
				Monthly:               []AIMonthlyCost{{Month: "2026-11", InputTokens: 10, CostUSD: "1.25000000"}}}
			if !reflect.DeepEqual(got, want) {
				t.Errorf("AICost() = %+v, want %+v", got, want)
			}
		})
	}
}

func TestStatsWithNoDataAreZeroAndNeverNull(t *testing.T) {
	s := newService(t, &fakeRepos{})

	jira, err := s.Jira("abc@arbisoft.com", Period{TimeFrame: "24h"})
	if err != nil || jira.ByType == nil || jira.ByTeam == nil || jira.IssuesResolved != 0 {
		t.Errorf("Jira() = %+v, %v; want zeros and empty lists", jira, err)
	}
	github, err := s.GitHub("abc@arbisoft.com", Period{TimeFrame: "24h"})
	if err != nil || github.ByRepo == nil || github.ByTeam == nil || github.Reviews != 0 {
		t.Errorf("GitHub() = %+v, %v; want zeros and empty lists", github, err)
	}
	usage, err := s.AIUsage("abc@arbisoft.com", Period{TimeFrame: "24h"})
	if err != nil || usage.Providers == nil || usage.Monthly == nil || len(usage.Providers)+len(usage.Monthly) != 0 {
		t.Errorf("AIUsage() = %+v, %v; want empty, non-nil lists", usage, err)
	}
	cost, err := s.AICost("abc@arbisoft.com", Period{TimeFrame: "24h"})
	if err != nil || cost.Models == nil || cost.Monthly == nil || cost.TotalEstimatedCostUSD != zeroCost {
		t.Errorf("AICost() = %+v, %v; want empty lists and a zero total", cost, err)
	}
}

func TestSinceJoiningStartsAtTheFirstActivity(t *testing.T) {
	joined := time.Date(2025, 3, 4, 9, 0, 0, 0, time.UTC)
	repos := &fakeRepos{joined: &joined}

	got, err := newService(t, repos).Jira("ABC@arbisoft.com", Period{Since: "joining"})
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
	if repos.calls[0].method != "FirstActivity" || repos.calls[0].email != "abc@arbisoft.com" {
		t.Errorf("first call = %+v, want FirstActivity for the lowercased email", repos.calls[0])
	}
}

func TestSinceJoiningWithoutActivityIsAnEmptyWindow(t *testing.T) {
	got, err := newService(t, &fakeRepos{}).AICost("abc@arbisoft.com", Period{Since: "joining"})
	if err != nil {
		t.Fatalf("AICost() error = %v", err)
	}
	if !got.From.Equal(fixedNow) || !got.To.Equal(fixedNow) || got.TotalEstimatedCostUSD != zeroCost {
		t.Errorf("AICost() = %+v, want an empty window at now and zero cost", got)
	}
}
