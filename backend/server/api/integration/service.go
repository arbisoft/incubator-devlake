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
	"fmt"
	"math"
	"net/mail"
	"sort"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
)

const (
	// maxEmailLength is the longest address SMTP allows.
	maxEmailLength = 320
	// dayLayout formats the dates the daily AI tables store.
	dayLayout = "2006-01-02"
	// zeroCost is the total for an engineer with no AI cost records.
	zeroCost = "0.00000000"
)

// rowsReader is the one DAL method the service needs. dal.Dal satisfies it.
type rowsReader interface {
	All(dst interface{}, clauses ...dal.Clause) errors.Error
}

var _ rowsReader = (dal.Dal)(nil)

// StatsService reads an engineer's stats from the domain tables. It is safe for concurrent use.
type StatsService struct {
	db  rowsReader
	now func() time.Time
}

// Option configures a StatsService.
type Option func(*StatsService)

// WithClock sets the clock that ends every window. The default is time.Now.
func WithClock(now func() time.Time) Option {
	return func(s *StatsService) { s.now = now }
}

// NewStatsService returns a service that reads through db, which must not be nil.
func NewStatsService(db rowsReader, opts ...Option) (*StatsService, errors.Error) {
	if db == nil {
		return nil, errors.Default.New("stats service: nil db")
	}
	s := &StatsService{db: db, now: time.Now}
	for _, opt := range opts {
		opt(s)
	}
	if s.now == nil {
		return nil, errors.Default.New("stats service: nil clock")
	}
	return s, nil
}

// window validates the email and period and returns the response header. Errors are BadInput and name the field.
func (s *StatsService) window(email string, p Period) (StatsWindow, errors.Error) {
	normalized, err := normalizeEmail(email)
	if err != nil {
		return StatsWindow{}, err
	}
	if p.Since != "" {
		return s.sinceWindow(normalized, p)
	}
	from, to, timeFrame, err := p.resolve(s.now())
	if err != nil {
		return StatsWindow{}, err
	}
	return StatsWindow{Email: normalized, TimeFrame: timeFrame, From: from, To: to}, nil
}

// sinceJoining is the only value since accepts.
const sinceJoining = "joining"

// sinceWindow resolves since=joining to [first activity, now). An email with no activity gets an empty window at now.
func (s *StatsService) sinceWindow(email string, p Period) (StatsWindow, errors.Error) {
	if p.Since != sinceJoining {
		return StatsWindow{}, errors.BadInput.New("since must be joining")
	}
	if p.TimeFrame != "" || p.From != "" || p.To != "" {
		return StatsWindow{}, errors.BadInput.New("give one of tf, since, or from and to")
	}
	to := s.now().UTC()
	joined, err := s.joiningDate(email)
	if err != nil {
		return StatsWindow{}, err
	}
	from := to
	if joined != nil && joined.Before(to) {
		from = joined.UTC()
	}
	return StatsWindow{Email: email, Since: sinceJoining, From: from, To: to}, nil
}

// joiningDate returns the earliest Jira, GitHub or AI activity recorded for email, or nil when there is none.
func (s *StatsService) joiningDate(email string) (*time.Time, errors.Error) {
	var rows []struct{ Joined *time.Time }
	if err := s.db.All(&rows,
		dal.Select("MIN(activity) AS joined"),
		dal.From(`(
			SELECT CAST(i.created_date AS DATETIME) AS activity FROM issues i JOIN accounts a ON a.id = i.creator_id
				WHERE i.id LIKE 'jira:%' AND LOWER(a.email) = ?
			UNION ALL SELECT CAST(i.created_date AS DATETIME) FROM issues i JOIN accounts a ON a.id = i.assignee_id
				WHERE i.id LIKE 'jira:%' AND LOWER(a.email) = ?
			UNION ALL SELECT CAST(c.authored_date AS DATETIME) FROM commits c
				WHERE LOWER(c.author_email) = ? AND EXISTS (SELECT 1 FROM repo_commits rc WHERE rc.commit_sha = c.sha AND rc.repo_id LIKE 'github:%')
			UNION ALL SELECT CAST(p.created_date AS DATETIME) FROM pull_requests p JOIN accounts a ON a.id = p.author_id
				WHERE p.id LIKE 'github:%' AND LOWER(a.email) = ?
			UNION ALL SELECT CAST(date AS DATETIME) FROM ai_activities WHERE LOWER(user_email) = ?
			UNION ALL SELECT CAST(date AS DATETIME) FROM ai_model_usages WHERE LOWER(user_email) = ?
		) activities`, email, email, email, email, email, email),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read the engineer's first activity")
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0].Joined, nil
}

// normalizeEmail accepts a bare address only and lowercases it, because the stored emails are case-sensitive.
func normalizeEmail(email string) (string, errors.Error) {
	trimmed := strings.TrimSpace(email)
	address, err := mail.ParseAddress(trimmed)
	if err != nil || address.Address != trimmed || address.Name != "" || len(trimmed) > maxEmailLength {
		return "", errors.BadInput.New("email must be a valid email address")
	}
	return strings.ToLower(trimmed), nil
}

// Jira returns the Jira stats for email over the period.
func (s *StatsService) Jira(email string, p Period) (*JiraStats, errors.Error) {
	w, err := s.window(email, p)
	if err != nil {
		return nil, err
	}
	var assigned []struct {
		IssuesResolved      int64
		StoryPointsResolved float64
		IssuesInProgress    int64
		IssuesTodo          int64
		AvgResolutionHours  float64
	}
	if err := s.db.All(&assigned,
		dal.Select(`COALESCE(SUM(i.resolution_date >= ? AND i.resolution_date < ?), 0) AS issues_resolved,
			COALESCE(SUM(CASE WHEN i.resolution_date >= ? AND i.resolution_date < ? THEN i.story_point END), 0) AS story_points_resolved,
			COALESCE(SUM(i.status = 'IN_PROGRESS'), 0) AS issues_in_progress,
			COALESCE(SUM(i.status = 'TODO'), 0) AS issues_todo,
			COALESCE(AVG(CASE WHEN i.resolution_date >= ? AND i.resolution_date < ? THEN TIMESTAMPDIFF(MINUTE, i.created_date, i.resolution_date) END), 0) / 60 AS avg_resolution_hours`,
			w.From, w.To, w.From, w.To, w.From, w.To),
		dal.From("issues i JOIN accounts a ON a.id = i.assignee_id"),
		dal.Where("i.id LIKE 'jira:%' AND LOWER(a.email) = ?", w.Email),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read jira issues assigned to the engineer")
	}
	var created []struct{ IssuesCreated int64 }
	if err := s.db.All(&created,
		dal.Select("COUNT(*) AS issues_created"),
		dal.From("issues i JOIN accounts a ON a.id = i.creator_id"),
		dal.Where("i.id LIKE 'jira:%' AND LOWER(a.email) = ? AND i.created_date >= ? AND i.created_date < ?", w.Email, w.From, w.To),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read jira issues created by the engineer")
	}
	var byType []JiraTypeStats
	if err := s.db.All(&byType,
		dal.Select(`COALESCE(NULLIF(i.type, ''), NULLIF(i.original_type, ''), 'UNKNOWN') AS issue_type,
			COUNT(*) AS resolved_count, COALESCE(SUM(i.story_point), 0) AS points_total`),
		dal.From("issues i JOIN accounts a ON a.id = i.assignee_id"),
		dal.Where("i.id LIKE 'jira:%' AND LOWER(a.email) = ? AND i.resolution_date >= ? AND i.resolution_date < ?", w.Email, w.From, w.To),
		dal.Groupby("issue_type"),
		dal.Orderby("issue_type"),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read jira issues resolved by type")
	}
	var byTeam []JiraTeamStats
	if err := s.db.All(&byTeam,
		dal.Select("t.team AS team, COUNT(*) AS resolved_count, COALESCE(SUM(t.story_point), 0) AS points_total"),
		// DISTINCT first, because an issue can sit on several boards of the same project.
		dal.From("(SELECT DISTINCT pm.project_name AS team, i.id, i.story_point FROM issues i"+
			" JOIN accounts a ON a.id = i.assignee_id JOIN board_issues bi ON bi.issue_id = i.id"+
			" JOIN project_mapping pm ON pm.row_id = bi.board_id AND pm.`table` = 'boards'"+
			" WHERE i.id LIKE 'jira:%' AND LOWER(a.email) = ? AND i.resolution_date >= ? AND i.resolution_date < ?) t",
			w.Email, w.From, w.To),
		dal.Groupby("t.team"),
		dal.Orderby("t.team"),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read jira issues resolved by team")
	}
	// Aggregates return one row; an empty slice (for example from a fake) means zeros.
	out := &JiraStats{StatsWindow: w, ByType: nonNil(byType), ByTeam: nonNil(byTeam)}
	if len(assigned) > 0 {
		out.AvgResolutionHours = assigned[0].AvgResolutionHours
		out.IssuesResolved = assigned[0].IssuesResolved
		out.StoryPointsResolved = assigned[0].StoryPointsResolved
		out.IssuesInProgress = assigned[0].IssuesInProgress
		out.IssuesTodo = assigned[0].IssuesTodo
	}
	if len(created) > 0 {
		out.IssuesCreated = created[0].IssuesCreated
	}
	return out, nil
}

// GitHub returns the GitHub stats for email over the period.
func (s *StatsService) GitHub(email string, p Period) (*GitHubStats, errors.Error) {
	w, err := s.window(email, p)
	if err != nil {
		return nil, err
	}
	var commits []struct{ Commits, Additions, Deletions int64 }
	if err := s.db.All(&commits,
		dal.Select("COUNT(*) AS commits, COALESCE(SUM(c.additions), 0) AS additions, COALESCE(SUM(c.deletions), 0) AS deletions"),
		dal.From("commits c"),
		dal.Where(`LOWER(c.author_email) = ? AND c.authored_date >= ? AND c.authored_date < ?
			AND EXISTS (SELECT 1 FROM repo_commits rc WHERE rc.commit_sha = c.sha AND rc.repo_id LIKE 'github:%')`,
			w.Email, w.From, w.To),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read github commits")
	}
	var authored []struct {
		PullRequestsOpened, PullRequestsMerged int64
		AvgPrMergeHours                        float64
	}
	if err := s.db.All(&authored,
		dal.Select(`COALESCE(SUM(p.created_date >= ? AND p.created_date < ?), 0) AS pull_requests_opened,
			COALESCE(SUM(p.merged_date >= ? AND p.merged_date < ?), 0) AS pull_requests_merged,
			COALESCE(AVG(CASE WHEN p.merged_date >= ? AND p.merged_date < ? THEN TIMESTAMPDIFF(MINUTE, p.created_date, p.merged_date) END), 0) / 60 AS avg_pr_merge_hours`,
			w.From, w.To, w.From, w.To, w.From, w.To),
		dal.From("pull_requests p JOIN accounts a ON a.id = p.author_id"),
		dal.Where("p.id LIKE 'github:%' AND LOWER(a.email) = ?", w.Email),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read github pull requests authored")
	}
	var withCommits []struct{ PullRequestsWithCommits int64 }
	if err := s.db.All(&withCommits,
		dal.Select("COUNT(DISTINCT prc.pull_request_id) AS pull_requests_with_commits"),
		dal.From("pull_request_commits prc"),
		dal.Where(`prc.pull_request_id LIKE 'github:%' AND LOWER(prc.commit_author_email) = ?
			AND prc.commit_authored_date >= ? AND prc.commit_authored_date < ?`, w.Email, w.From, w.To),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read github pull requests with the engineer's commits")
	}
	var reviews []struct{ Reviews, PullRequestsReviewed int64 }
	if err := s.db.All(&reviews,
		dal.Select("COUNT(*) AS reviews, COUNT(DISTINCT pc.pull_request_id) AS pull_requests_reviewed"),
		dal.From("pull_request_comments pc JOIN accounts a ON a.id = pc.account_id"),
		dal.Where(`pc.id LIKE 'github:%' AND pc.type = 'REVIEW' AND LOWER(a.email) = ?
			AND pc.created_date >= ? AND pc.created_date < ?`, w.Email, w.From, w.To),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read github reviews")
	}
	byRepo, err := s.githubBreakdown(w, "r.name", "JOIN repos r ON r.id = %s")
	if err != nil {
		return nil, err
	}
	byTeam, err := s.githubBreakdown(w, "pm.project_name", "JOIN project_mapping pm ON pm.row_id = %s AND pm.`table` = 'repos'")
	if err != nil {
		return nil, err
	}
	out := &GitHubStats{StatsWindow: w, ByRepo: byRepo, ByTeam: byTeam}
	if len(commits) > 0 {
		out.Commits, out.Additions, out.Deletions = commits[0].Commits, commits[0].Additions, commits[0].Deletions
	}
	if len(authored) > 0 {
		out.PullRequestsOpened, out.PullRequestsMerged = authored[0].PullRequestsOpened, authored[0].PullRequestsMerged
		out.AvgPrMergeHours = authored[0].AvgPrMergeHours
	}
	if len(withCommits) > 0 {
		out.PullRequestsWithCommits = withCommits[0].PullRequestsWithCommits
	}
	if len(reviews) > 0 {
		out.Reviews, out.PullRequestsReviewed = reviews[0].Reviews, reviews[0].PullRequestsReviewed
	}
	return out, nil
}

// githubBreakdown splits the engineer's work by group, which is a SQL expression over the repository (r) or project
// (pm) that joinFormat joins on the repo id it is given. Each group also carries the totals of every contributor, that
// is every author in commits or pull_requests, so the engineer's share of the group can be worked out. Commits and
// pull requests are listed once per group even when a project has several repos holding them.
func (s *StatsService) githubBreakdown(w StatsWindow, group, joinFormat string) ([]GitHubBreakdown, errors.Error) {
	var commits []struct {
		Name                         string
		RepoCommits, RepoLines       int64
		Contributors, Commits, LineChanged int64
	}
	if err := s.db.All(&commits,
		dal.Select(`t.name, COUNT(*) AS repo_commits, COALESCE(SUM(t.line_changed), 0) AS repo_lines, COUNT(DISTINCT t.email) AS contributors,
			COALESCE(SUM(t.email = ?), 0) AS commits, COALESCE(SUM(CASE WHEN t.email = ? THEN t.line_changed END), 0) AS line_changed`, w.Email, w.Email),
		dal.From("(SELECT DISTINCT "+group+" AS name, c.sha, LOWER(c.author_email) AS email,"+
			" COALESCE(c.additions, 0) + COALESCE(c.deletions, 0) AS line_changed"+
			" FROM commits c JOIN repo_commits rc ON rc.commit_sha = c.sha "+fmt.Sprintf(joinFormat, "rc.repo_id")+
			" WHERE rc.repo_id LIKE 'github:%' AND c.authored_date >= ? AND c.authored_date < ?) t", w.From, w.To),
		dal.Groupby("t.name"),
		dal.Having("SUM(t.email = ?) > 0", w.Email),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read github commits by group")
	}
	var prs []struct {
		Name                   string
		RepoOpened, RepoMerged int64
		Opened, Merged         int64
	}
	if err := s.db.All(&prs,
		dal.Select(`t.name, COALESCE(SUM(t.opened), 0) AS repo_opened, COALESCE(SUM(t.merged), 0) AS repo_merged,
			COALESCE(SUM(t.opened AND t.email = ?), 0) AS opened, COALESCE(SUM(t.merged AND t.email = ?), 0) AS merged`, w.Email, w.Email),
		// A pull request counts for its author whatever the email, so the totals include accounts that hide theirs.
		dal.From("(SELECT DISTINCT "+group+" AS name, p.id, LOWER(a.email) AS email,"+
			" (p.created_date >= ? AND p.created_date < ?) AS opened, (p.merged_date >= ? AND p.merged_date < ?) AS merged"+
			" FROM pull_requests p LEFT JOIN accounts a ON a.id = p.author_id "+fmt.Sprintf(joinFormat, "p.base_repo_id")+
			" WHERE p.id LIKE 'github:%') t", w.From, w.To, w.From, w.To),
		dal.Groupby("t.name"),
		dal.Having("SUM((t.opened OR t.merged) AND t.email = ?) > 0", w.Email),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read github pull requests by group")
	}
	byName := map[string]*GitHubBreakdown{}
	var names []string
	row := func(name string) *GitHubBreakdown {
		if r, ok := byName[name]; ok {
			return r
		}
		r := &GitHubBreakdown{Name: name}
		byName[name] = r
		names = append(names, name)
		return r
	}
	for _, c := range commits {
		r := row(c.Name)
		r.Commits, r.LinesChanged = c.Commits, c.LineChanged
		r.RepoCommits, r.RepoLinesChanged, r.Contributors = c.RepoCommits, c.RepoLines, c.Contributors
	}
	for _, p := range prs {
		r := row(p.Name)
		r.PullRequestsOpened, r.PullRequestsMerged = p.Opened, p.Merged
		r.RepoPullRequestsMerged = p.RepoMerged
	}
	sort.Strings(names)
	out := make([]GitHubBreakdown, 0, len(names))
	for _, name := range names {
		r := byName[name]
		r.CommitSharePct = sharePct(r.Commits, r.RepoCommits)
		r.LinesSharePct = sharePct(r.LinesChanged, r.RepoLinesChanged)
		r.PullRequestsMergedSharePct = sharePct(r.PullRequestsMerged, r.RepoPullRequestsMerged)
		out = append(out, *r)
	}
	return out, nil
}

// sharePct returns part as a percentage of total with one decimal, or 0 when total is 0.
func sharePct(part, total int64) float64 {
	if total <= 0 {
		return 0
	}
	return math.Round(float64(part)*1000/float64(total)) / 10
}

// nonNil returns rows, or an empty slice so the JSON is [] and never null.
func nonNil[T any](rows []T) []T {
	if rows == nil {
		return []T{}
	}
	return rows
}

// days returns the inclusive day range the daily AI tables use for the window.
func days(w StatsWindow) (first, last string) {
	return w.From.Format(dayLayout), w.To.Format(dayLayout)
}

// AIUsage returns the AI usage stats for email over the period, at day granularity.
func (s *StatsService) AIUsage(email string, p Period) (*AIUsageStats, errors.Error) {
	w, err := s.window(email, p)
	if err != nil {
		return nil, err
	}
	first, last := days(w)
	var providers []AIProviderUsage
	if err := s.db.All(&providers,
		dal.Select(`provider, COUNT(DISTINCT date) AS active_days, COALESCE(SUM(num_sessions), 0) AS sessions,
			COALESCE(SUM(suggestions_count), 0) AS suggestions, COALESCE(SUM(acceptance_count), 0) AS acceptances,
			COALESCE(SUM(lines_added), 0) AS lines_added, COALESCE(SUM(lines_removed), 0) AS lines_removed,
			COALESCE(SUM(commits_created), 0) AS commits_by_ai, COALESCE(SUM(prs_created), 0) AS pull_requests`),
		dal.From("ai_activities"),
		dal.Where("LOWER(user_email) = ? AND date >= ? AND date <= ?", w.Email, first, last),
		dal.Groupby("provider"),
		dal.Orderby("provider"),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read ai activities")
	}
	var decisions []struct{ ToolEditsAccepted, ToolEditsRejected int64 }
	if err := s.db.All(&decisions,
		dal.Select("COALESCE(SUM(accepted_count), 0) AS tool_edits_accepted, COALESCE(SUM(rejected_count), 0) AS tool_edits_rejected"),
		dal.From("ai_tool_decisions"),
		dal.Where("LOWER(user_email) = ? AND date >= ? AND date <= ?", w.Email, first, last),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read ai tool decisions")
	}
	var monthly []AIMonthlyUsage
	if err := s.db.All(&monthly,
		dal.Select(`provider, DATE_FORMAT(date, '%Y-%m') AS month, COUNT(DISTINCT date) AS days_active,
			COALESCE(SUM(num_sessions), 0) AS sessions`),
		dal.From("ai_activities"),
		dal.Where("LOWER(user_email) = ? AND date >= ? AND date <= ?", w.Email, first, last),
		dal.Groupby("provider, month"),
		dal.Orderby("month, provider"),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read ai monthly activity")
	}
	out := &AIUsageStats{StatsWindow: w, Providers: nonNil(providers), Monthly: nonNil(monthly)}
	lastMonth := w.To.Format("2006-01")
	for _, m := range out.Monthly {
		if m.Month == lastMonth {
			out.ActiveInLastMonth = true
		}
	}
	if len(decisions) > 0 {
		out.ToolEditsAccepted, out.ToolEditsRejected = decisions[0].ToolEditsAccepted, decisions[0].ToolEditsRejected
	}
	return out, nil
}

// aiCostRows is the per-model union both cost queries read: Claude from model usage records, and every other
// provider from daily activity, which is where Cursor reports cost. Claude activity rows carry no cost, so
// skipping them avoids counting anything twice. Costs are summed as DECIMAL so no float rounding reaches the API.
const aiCostRows = `(
	SELECT provider, model, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
		SUM(cache_read_tokens) AS cache_read_tokens, SUM(cache_creation_tokens) AS cache_creation_tokens,
		SUM(estimated_cost_usd) AS cost
	FROM ai_model_usages WHERE LOWER(user_email) = ? AND date >= ? AND date <= ? GROUP BY provider, model
	UNION ALL
	SELECT provider, model, SUM(input_tokens), SUM(output_tokens), 0, 0, SUM(CAST(estimated_cost_usd AS DECIMAL(20,8)))
	FROM ai_activities WHERE provider <> 'claude' AND LOWER(user_email) = ? AND date >= ? AND date <= ? GROUP BY provider, model
) costs`

// aiMonthlyCostRows is aiCostRows per UTC month instead of per model.
const aiMonthlyCostRows = `(
	SELECT DATE_FORMAT(date, '%Y-%m') AS month, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
		SUM(estimated_cost_usd) AS cost
	FROM ai_model_usages WHERE LOWER(user_email) = ? AND date >= ? AND date <= ? GROUP BY month
	UNION ALL
	SELECT DATE_FORMAT(date, '%Y-%m'), SUM(input_tokens), SUM(output_tokens), SUM(CAST(estimated_cost_usd AS DECIMAL(20,8)))
	FROM ai_activities WHERE provider <> 'claude' AND LOWER(user_email) = ? AND date >= ? AND date <= ? GROUP BY DATE_FORMAT(date, '%Y-%m')
) costs`

// AICost returns the AI cost stats for email over the period, at day granularity.
func (s *StatsService) AICost(email string, p Period) (*AICostStats, errors.Error) {
	w, err := s.window(email, p)
	if err != nil {
		return nil, err
	}
	first, last := days(w)
	params := []interface{}{w.Email, first, last, w.Email, first, last}
	var models []AIModelCost
	if err := s.db.All(&models,
		dal.Select(`provider, model, COALESCE(SUM(input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens,
			COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens, COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
			CAST(CAST(COALESCE(SUM(cost), 0) AS DECIMAL(20,8)) AS CHAR) AS estimated_cost_usd`),
		dal.From(aiCostRows, params...),
		dal.Groupby("provider, model"),
		dal.Orderby("provider, model"),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read ai model costs")
	}
	var total []struct{ TotalEstimatedCostUsd string }
	if err := s.db.All(&total,
		dal.Select("CAST(CAST(COALESCE(SUM(cost), 0) AS DECIMAL(20,8)) AS CHAR) AS total_estimated_cost_usd"),
		dal.From(aiCostRows, params...),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read ai total cost")
	}
	var monthly []AIMonthlyCost
	if err := s.db.All(&monthly,
		dal.Select(`month, COALESCE(SUM(input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens,
			CAST(CAST(COALESCE(SUM(cost), 0) AS DECIMAL(20,8)) AS CHAR) AS cost_usd`),
		dal.From(aiMonthlyCostRows, params...),
		dal.Groupby("month"),
		dal.Orderby("month"),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read ai monthly costs")
	}
	out := &AICostStats{StatsWindow: w, Models: nonNil(models), Monthly: nonNil(monthly), TotalEstimatedCostUSD: zeroCost}
	if len(total) > 0 && total[0].TotalEstimatedCostUsd != "" {
		out.TotalEstimatedCostUSD = total[0].TotalEstimatedCostUsd
	}
	return out, nil
}
