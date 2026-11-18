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
	"os"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/config"
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models/domainlayer"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/core/models/domainlayer/code"
	"github.com/apache/incubator-devlake/core/models/domainlayer/crossdomain"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ticket"
	"github.com/apache/incubator-devlake/core/runner"
	"github.com/apache/incubator-devlake/impls/dalgorm"
	"github.com/apache/incubator-devlake/impls/logruslog"
)

// These tests run the repositories' SQL on MySQL. They run only when E2E_DB_URL is set in the environment; .env is
// not read, so a URL left there can't point them at a real database by accident. They create the tables they read
// when missing, never change existing ones, and write every row inside a transaction that is always rolled back.

const (
	dbTestUser  = "repo-test-user@example.invalid"
	dbTestOther = "repo-test-other@example.invalid"
)

// testTx returns a transaction on the E2E database that is rolled back when the test ends, or skips the test.
func testTx(t *testing.T) dal.Transaction {
	t.Helper()
	url := os.Getenv("E2E_DB_URL")
	if url == "" {
		t.Skip("E2E_DB_URL is not set in the environment")
	}
	cfg := config.GetConfig()
	cfg.Set("DB_URL", url)
	gormDB, err := runner.NewGormDb(cfg, logruslog.Global)
	if err != nil {
		t.Fatalf("connect to E2E_DB_URL: %v", err)
	}
	db := dalgorm.NewDalgorm(gormDB)
	for _, table := range []interface{}{
		&crossdomain.Account{}, &crossdomain.ProjectMapping{}, &code.PullRequest{}, &code.PullRequestComment{},
		&code.PullRequestCommit{}, &code.Commit{}, &code.RepoCommit{}, &code.Repo{}, &ticket.Issue{}, &ticket.BoardIssue{},
		&ai.AiActivity{}, &ai.AiModelUsage{}, &ai.AiToolDecision{},
	} {
		if !db.HasTable(table) {
			if err := db.AutoMigrate(table); err != nil {
				t.Fatalf("create table for %T: %v", table, err)
			}
		}
	}
	tx := db.Begin()
	t.Cleanup(func() {
		if err := tx.Rollback(); err != nil {
			t.Errorf("roll back: %v", err)
		}
	})
	return tx
}

// insert writes rows into tx, failing the test on the first error.
func insert(t *testing.T, tx dal.Transaction, rows ...interface{}) {
	t.Helper()
	for _, row := range rows {
		if err := tx.Create(row); err != nil {
			t.Fatalf("insert %T: %v", row, err)
		}
	}
}

func entity(id string) domainlayer.DomainEntity { return domainlayer.DomainEntity{Id: id} }

func day(s string) time.Time {
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return d
}

func TestEveryRepositoryQueryRunsOnMySQL(t *testing.T) {
	tx := testTx(t)
	for _, tc := range repoCalls(t) {
		t.Run(tc.name, func(t *testing.T) {
			if err := tc.run(tx); err != nil {
				t.Errorf("error = %v, want the query to run", err)
			}
		})
	}
}

func TestGitHubReviewsOnMySQL(t *testing.T) {
	tx := testTx(t)
	const p = "github:IntegrationRepoTest:"
	in, out := day("2026-11-05"), day("2026-10-01")
	insert(t, tx,
		&crossdomain.Account{DomainEntity: entity(p + "user"), Email: "Repo-Test-User@example.invalid"},
		&crossdomain.Account{DomainEntity: entity(p + "other"), Email: dbTestOther},
		&crossdomain.Account{DomainEntity: entity(p + "no-email")},
	)
	pr := func(n, author string) *code.PullRequest {
		return &code.PullRequest{DomainEntity: entity(p + "pr" + n), AuthorId: author, CreatedDate: in}
	}
	insert(t, tx,
		pr("1", p+"other"), pr("2", p+"other"), pr("3", p+"other"), pr("4", p+"user"),
		pr("5", p+"no-email"), pr("6", p+"missing-account"), pr("7", p+"other"), pr("8", p+"other"),
	)
	comment := func(id, prNo, account, kind string, at time.Time) *code.PullRequestComment {
		return &code.PullRequestComment{DomainEntity: entity(id), PullRequestId: p + "pr" + prNo, AccountId: p + account, Type: kind, CreatedDate: at}
	}
	insert(t, tx,
		comment(p+"c1", "1", "user", "REVIEW", in), // review only
		comment(p+"c2", "2", "user", "NORMAL", in), // comment only
		comment(p+"c3", "2", "user", "NORMAL", in), // a second comment on the same pull request
		comment(p+"c4", "3", "user", "REVIEW", in), // review and comment
		comment(p+"c5", "3", "user", "DIFF", in),
		comment(p+"c6", "4", "user", "NORMAL", in), // the engineer's own pull request
		comment(p+"c7", "4", "user", "REVIEW", in),
		comment(p+"c8", "5", "user", "DIFF", in),           // the author has no email
		comment(p+"c9", "6", "user", "NORMAL", in),         // the author has no account
		comment(p+"c10", "7", "user", "NORMAL", out),       // outside the window
		comment(p+"c11", "8", "other", "NORMAL", in),       // someone else's comment
		comment("gitlab:x:c12", "2", "user", "NORMAL", in), // not GitHub
	)
	r := codeRepo(t, rowsReader(tx), SourceGitHub)

	got, err := r.Reviews(dbTestUser, day("2026-11-01"), day("2026-11-10"))

	if err != nil {
		t.Fatalf("Reviews() error = %v", err)
	}
	want := ReviewCounts{Reviews: 2, ReviewComments: 5, PullRequestsReviewed: 5}
	if got != want {
		t.Errorf("Reviews() = %+v, want %+v", got, want)
	}

	// The same rows read as another source count only that source's comment.
	gitlab, err := codeRepo(t, rowsReader(tx), "gitlab").Reviews(dbTestUser, day("2026-11-01"), day("2026-11-10"))
	if err != nil {
		t.Fatalf("gitlab Reviews() error = %v", err)
	}
	if want := (ReviewCounts{ReviewComments: 1, PullRequestsReviewed: 1}); gitlab != want {
		t.Errorf("gitlab Reviews() = %+v, want %+v", gitlab, want)
	}
}

func TestGitHubBreakdownOnMySQL(t *testing.T) {
	tx := testTx(t)
	const p = "github:IntegrationRepoTest:"
	in := day("2026-11-05")
	insert(t, tx,
		&code.Repo{DomainEntity: entity(p + "repo"), Name: "org/repo-test"},
		&crossdomain.Account{DomainEntity: entity(p + "user"), Email: dbTestUser},
		&code.Commit{Sha: "repotest-1", AuthorEmail: dbTestUser, AuthoredDate: in, CommittedDate: in, Additions: 10, Deletions: 2},
		&code.Commit{Sha: "repotest-2", AuthorEmail: "REPO-TEST-USER@example.invalid", AuthoredDate: in, CommittedDate: in, Additions: 3},
		&code.Commit{Sha: "repotest-3", AuthorEmail: dbTestOther, AuthoredDate: in, CommittedDate: in, Additions: 5},
		&code.RepoCommit{RepoId: p + "repo", CommitSha: "repotest-1"},
		&code.RepoCommit{RepoId: p + "repo", CommitSha: "repotest-2"},
		&code.RepoCommit{RepoId: p + "repo", CommitSha: "repotest-3"},
		&code.PullRequest{DomainEntity: entity(p + "pr1"), BaseRepoId: p + "repo", AuthorId: p + "user", CreatedDate: in, MergedDate: &in},
		&code.PullRequest{DomainEntity: entity(p + "pr2"), BaseRepoId: p + "repo", AuthorId: p + "nobody", CreatedDate: in, MergedDate: &in},
	)
	r := codeRepo(t, rowsReader(tx), SourceGitHub)
	from, to := day("2026-11-01"), day("2026-11-10")

	commits, err := r.CommitsByGroup(dbTestUser, from, to, GroupByRepo)
	if err != nil {
		t.Fatalf("CommitsByGroup() error = %v", err)
	}
	prs, err := r.PullRequestsByGroup(dbTestUser, from, to, GroupByRepo)
	if err != nil {
		t.Fatalf("PullRequestsByGroup() error = %v", err)
	}

	wantCommits := CommitGroupRow{Name: "org/repo-test", RepoCommits: 3, RepoLines: 20, Contributors: 2, EngineerCommits: 2, EngineerLines: 15}
	if len(commits) != 1 || commits[0] != wantCommits {
		t.Errorf("CommitsByGroup() = %+v, want [%+v]", commits, wantCommits)
	}
	wantPRs := PullRequestGroupRow{Name: "org/repo-test", RepoOpened: 2, RepoMerged: 2, EngineerOpened: 1, EngineerMerged: 1}
	if len(prs) != 1 || prs[0] != wantPRs {
		t.Errorf("PullRequestsByGroup() = %+v, want [%+v]", prs, wantPRs)
	}
}

func TestAIMonthlyOnMySQL(t *testing.T) {
	tx := testTx(t)
	activity := func(id, provider, email, date string, sessions, suggestions, acceptances int) *ai.AiActivity {
		return &ai.AiActivity{DomainEntity: entity("IntegrationRepoTest:" + id), Provider: provider, UserEmail: email, Date: day(date),
			NumSessions: sessions, SuggestionsCount: suggestions, AcceptanceCount: acceptances}
	}
	insert(t, tx,
		activity("1", "copilot", dbTestUser, "2026-10-20", 2, 100, 30),
		activity("2", "copilot", dbTestUser, "2026-10-21", 3, 50, 20),
		activity("3", "copilot", dbTestUser, "2026-11-02", 1, 40, 10),
		activity("4", "cursor", dbTestUser, "2026-11-03", 4, 7, 2),
		activity("5", "cursor", "Repo-Test-User@example.invalid", "2026-11-03", 1, 3, 1),
		activity("6", "cursor", dbTestOther, "2026-11-03", 9, 99, 99),
		activity("7", "cursor", dbTestUser, "2026-09-30", 9, 99, 99), // before the first day
	)
	r := mustRepo(t, NewAI, rowsReader(tx))

	monthly, err := r.Monthly(dbTestUser, "2026-10-01", "2026-11-10")
	if err != nil {
		t.Fatalf("Monthly() error = %v", err)
	}
	providers, err := r.Providers(dbTestUser, "2026-10-01", "2026-11-10")
	if err != nil {
		t.Fatalf("Providers() error = %v", err)
	}

	wantMonthly := []AIMonthlyRow{
		{Provider: "copilot", Month: "2026-10", ActiveDays: 2, Sessions: 5, Suggestions: 150, Acceptances: 50},
		{Provider: "copilot", Month: "2026-11", ActiveDays: 1, Sessions: 1, Suggestions: 40, Acceptances: 10},
		{Provider: "cursor", Month: "2026-11", ActiveDays: 1, Sessions: 5, Suggestions: 10, Acceptances: 3},
	}
	if len(monthly) != len(wantMonthly) {
		t.Fatalf("Monthly() = %+v, want %+v", monthly, wantMonthly)
	}
	for i := range wantMonthly {
		if monthly[i] != wantMonthly[i] {
			t.Errorf("Monthly()[%d] = %+v, want %+v", i, monthly[i], wantMonthly[i])
		}
	}
	// Each provider's months add up to its total over the same days.
	sums := map[string]AIMonthlyRow{}
	for _, m := range monthly {
		s := sums[m.Provider]
		s.Sessions, s.Suggestions, s.Acceptances = s.Sessions+m.Sessions, s.Suggestions+m.Suggestions, s.Acceptances+m.Acceptances
		sums[m.Provider] = s
	}
	for _, p := range providers {
		s := sums[p.Provider]
		if s.Sessions != p.Sessions || s.Suggestions != p.Suggestions || s.Acceptances != p.Acceptances {
			t.Errorf("%s months sum to %+v, want the provider total %+v", p.Provider, s, p)
		}
	}
}
