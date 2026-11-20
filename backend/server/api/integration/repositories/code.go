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

package repositories

import (
	"fmt"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
)

// CommitCounts summarizes an engineer's commits.
type CommitCounts struct {
	Commits, Additions, Deletions int64
}

// AuthoredCounts summarizes the pull requests an engineer's account authored.
type AuthoredCounts struct {
	PullRequestsOpened, PullRequestsMerged int64
	AvgPrMergeHours                        float64
}

// ReviewCounts summarizes an engineer's review work on pull requests someone else authored.
type ReviewCounts struct {
	// Reviews counts review submissions.
	Reviews int64
	// ReviewComments counts normal and inline comments.
	ReviewComments int64
	// PullRequestsReviewed counts distinct pull requests with either.
	PullRequestsReviewed int64
}

// Group is how work is split. It is one of the GroupBy constants.
type Group int

const (
	// GroupByRepo splits work by repository name.
	GroupByRepo Group = iota
	// GroupByTeam splits work by DevLake project.
	GroupByTeam
)

// groupSQL is the SQL for each Group: the group name over the repository (r) or project (pm), and a join
// format that takes the repo id column.
var groupSQL = map[Group]struct{ name, joinFormat string }{
	GroupByRepo: {"r.name", "JOIN repos r ON r.id = %s"},
	GroupByTeam: {"pm.project_name", "JOIN project_mapping pm ON pm.row_id = %s AND pm.`table` = 'repos'"},
}

// CommitGroupRow is one group's commits in the window: the engineer's, and the totals of every author.
type CommitGroupRow struct {
	Name                           string
	RepoCommits, RepoLines         int64
	Contributors                   int64
	EngineerCommits, EngineerLines int64
}

// PullRequestGroupRow is one group's pull requests opened or merged in the window: the engineer's, and the
// totals of every author.
type PullRequestGroupRow struct {
	Name                   string
	RepoOpened, RepoMerged int64
	EngineerOpened         int64
	EngineerMerged         int64
}

// Code reads one git tool's work from the domain tables: the commits, pull requests and reviews whose ids start with
// its source, such as github. The tables are the same for every git tool DevLake collects. It is safe for
// concurrent use.
type Code struct {
	db     rowsReader
	source string
	idLike string
}

// NewCode returns a repository that reads source's work through db. db must not be nil, and source must be a
// lowercase tool name such as github (SourceGitHub).
func NewCode(db rowsReader, source string) (*Code, errors.Error) {
	if db == nil {
		return nil, errors.Default.New("code repository: nil db")
	}
	like, err := idLike(source)
	if err != nil {
		return nil, err
	}
	return &Code{db: db, source: source, idLike: like}, nil
}

// Commits summarizes the commits email authored in the window in the source's repositories. Commits match on the
// commit author email, so they don't depend on the account's email.
func (r *Code) Commits(email string, from, to time.Time) (CommitCounts, errors.Error) {
	var rows []CommitCounts
	if err := r.db.All(&rows,
		dal.Select("COUNT(*) AS commits, "+
			"COALESCE(SUM(c.additions), 0) AS additions, "+
			"COALESCE(SUM(c.deletions), 0) AS deletions"),
		dal.From("commits c"),
		dal.Where(`LOWER(c.author_email) = ?
			AND c.authored_date >= ?
			AND c.authored_date < ?
			AND EXISTS (SELECT 1
						FROM repo_commits rc
						WHERE rc.commit_sha = c.sha AND rc.repo_id LIKE ?)`,
			email, from, to, r.idLike),
	); err != nil {
		return CommitCounts{}, errors.Default.Wrap(err, "read "+r.source+" commits")
	}
	return singleRow(rows), nil
}

// Authored summarizes the pull requests email's account opened, and merged, in the window.
func (r *Code) Authored(email string, from, to time.Time) (AuthoredCounts, errors.Error) {
	var rows []AuthoredCounts
	if err := r.db.All(&rows,
		dal.Select(`COALESCE(SUM(p.created_date >= ? AND p.created_date < ?), 0) AS pull_requests_opened,
			COALESCE(SUM(p.merged_date >= ? AND p.merged_date < ?), 0) AS pull_requests_merged,
			COALESCE(
				AVG(CASE WHEN p.merged_date >= ? AND p.merged_date < ?
				THEN TIMESTAMPDIFF(MINUTE, p.created_date, p.merged_date) END), 0
				) / 60 AS avg_pr_merge_hours`,
			from, to, from, to, from, to),
		dal.From("pull_requests p JOIN accounts a ON a.id = p.author_id"),
		dal.Where("p.id LIKE ? AND LOWER(a.email) = ?", r.idLike, email),
	); err != nil {
		return AuthoredCounts{}, errors.Default.Wrap(err, "read "+r.source+" pull requests authored")
	}
	return singleRow(rows), nil
}

// PullRequestsWithCommits counts the pull requests holding a commit email authored in the window.
func (r *Code) PullRequestsWithCommits(email string, from, to time.Time) (int64, errors.Error) {
	var rows []struct{ PullRequestsWithCommits int64 }
	if err := r.db.All(&rows,
		dal.Select("COUNT(DISTINCT prc.pull_request_id) AS pull_requests_with_commits"),
		dal.From("pull_request_commits prc"),
		dal.Where(`prc.pull_request_id LIKE ?
			AND LOWER(prc.commit_author_email) = ?
			AND prc.commit_authored_date >= ?
			AND prc.commit_authored_date < ?`, r.idLike, email, from, to),
	); err != nil {
		return 0, errors.Default.Wrap(err, "read "+r.source+" pull requests with the engineer's commits")
	}
	return singleRow(rows).PullRequestsWithCommits, nil
}

// Reviews summarizes the reviews and comments email's account wrote in the window on pull requests someone else
// authored. An author's replies in review threads on their own pull request are stored as reviews too, so they are
// left out. A pull request whose author has no email, or no account, still counts: it isn't the engineer's.
func (r *Code) Reviews(email string, from, to time.Time) (ReviewCounts, errors.Error) {
	var rows []ReviewCounts
	if err := r.db.All(&rows,
		dal.Select(`COUNT(DISTINCT CASE WHEN pc.type = 'REVIEW' THEN pc.id END) AS reviews,
			COUNT(DISTINCT CASE WHEN pc.type IN ('NORMAL', 'DIFF') THEN pc.id END) AS review_comments,
			COUNT(DISTINCT pc.pull_request_id) AS pull_requests_reviewed`),
		dal.From(`pull_request_comments pc
			JOIN accounts a ON a.id = pc.account_id
			JOIN pull_requests p ON p.id = pc.pull_request_id
			LEFT JOIN accounts pa ON pa.id = p.author_id`),
		dal.Where(`pc.id LIKE ?
			AND pc.type IN ('REVIEW', 'NORMAL', 'DIFF')
			AND LOWER(a.email) = ?
			AND pc.created_date >= ?
			AND pc.created_date < ?
			AND (pa.email IS NULL OR LOWER(pa.email) <> ?)`,
			r.idLike, email, from, to, email),
	); err != nil {
		return ReviewCounts{}, errors.Default.Wrap(err, "read "+r.source+" reviews")
	}
	return singleRow(rows), nil
}

// CommitsByGroup lists, per group with a commit email authored in the window, the engineer's commits and lines
// changed next to every author's. A commit sits once in a group even when several of the group's repos hold it.
func (r *Code) CommitsByGroup(email string, from, to time.Time, group Group) ([]CommitGroupRow, errors.Error) {
	g, ok := groupSQL[group]
	if !ok {
		return nil, errors.Default.New(fmt.Sprintf("unknown group %d", group))
	}
	var rows []CommitGroupRow
	if err := r.db.All(&rows,
		dal.Select(`t.name, COUNT(*) AS repo_commits,
			COALESCE(SUM(t.lines_changed), 0) AS repo_lines,
			COUNT(DISTINCT t.email) AS contributors,
			COALESCE(SUM(t.email = ?), 0) AS engineer_commits,
			COALESCE(SUM(CASE WHEN t.email = ? THEN t.lines_changed END), 0) AS engineer_lines`,
			email, email),
		dal.From("(SELECT DISTINCT "+g.name+" AS name, c.sha, LOWER(c.author_email) AS email,"+
			" COALESCE(c.additions, 0) + COALESCE(c.deletions, 0) AS lines_changed"+
			" FROM commits c"+
			" JOIN repo_commits rc ON rc.commit_sha = c.sha "+fmt.Sprintf(g.joinFormat, "rc.repo_id")+
			" WHERE rc.repo_id LIKE ? AND c.authored_date >= ? AND c.authored_date < ?) t", r.idLike, from, to),
		dal.Groupby("t.name"),
		dal.Having("SUM(t.email = ?) > 0", email),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read "+r.source+" commits by group")
	}
	return rows, nil
}

// PullRequestsByGroup lists, per group where email's account opened or merged a pull request in the window, the
// engineer's pull requests next to every author's. A pull request counts for its author whatever the email, so
// the totals include accounts that hide theirs.
func (r *Code) PullRequestsByGroup(email string, from, to time.Time, group Group) ([]PullRequestGroupRow, errors.Error) {
	g, ok := groupSQL[group]
	if !ok {
		return nil, errors.Default.New(fmt.Sprintf("unknown group %d", group))
	}
	var rows []PullRequestGroupRow
	if err := r.db.All(&rows,
		dal.Select(`t.name, COALESCE(SUM(t.opened), 0) AS repo_opened,
			COALESCE(SUM(t.merged), 0) AS repo_merged,
			COALESCE(SUM(t.opened AND t.email = ?), 0) AS engineer_opened,
			COALESCE(SUM(t.merged AND t.email = ?), 0) AS engineer_merged`, email, email),
		dal.From("(SELECT DISTINCT "+g.name+" AS name, p.id, LOWER(a.email) AS email,"+
			" (p.created_date >= ? AND p.created_date < ?) AS opened, "+
			"(p.merged_date >= ? AND p.merged_date < ?) AS merged"+
			" FROM pull_requests p "+
			" LEFT JOIN accounts a ON a.id = p.author_id "+fmt.Sprintf(g.joinFormat, "p.base_repo_id")+
			" WHERE p.id LIKE ?) t", from, to, from, to, r.idLike),
		dal.Groupby("t.name"),
		dal.Having("SUM((t.opened OR t.merged) AND t.email = ?) > 0", email),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read "+r.source+" pull requests by group")
	}
	return rows, nil
}
