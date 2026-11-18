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
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"

	"github.com/apache/incubator-devlake/core/errors"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
)

var (
	repoFrom = time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC)
	repoTo   = time.Date(2026, 11, 10, 0, 0, 0, 0, time.UTC)
)

// repoCall runs one repository method and returns its error, ignoring the result.
type repoCall struct {
	name    string
	run     func(db rowsReader) errors.Error
	wantMsg string
}

func mustRepo[T any](t *testing.T, newRepo func(rowsReader) (*T, errors.Error), db rowsReader) *T {
	t.Helper()
	r, err := newRepo(db)
	if err != nil {
		t.Fatalf("new repository error = %v", err)
	}
	return r
}

func repoCalls(t *testing.T) []repoCall {
	t.Helper()
	const email, firstDay, lastDay = "abc@arbisoft.com", "2026-11-03", "2026-11-10"
	activity := func(db rowsReader) *ActivityRepository { return mustRepo(t, NewActivityRepository, db) }
	jira := func(db rowsReader) *JiraRepository { return mustRepo(t, NewJiraRepository, db) }
	github := func(db rowsReader) *GitHubRepository { return mustRepo(t, NewGitHubRepository, db) }
	ai := func(db rowsReader) *AIRepository { return mustRepo(t, NewAIRepository, db) }
	return []repoCall{
		{"FirstActivity", func(db rowsReader) errors.Error { _, err := activity(db).FirstActivity(email); return err }, "read the engineer's first activity"},
		{"Assigned", func(db rowsReader) errors.Error { _, err := jira(db).Assigned(email, repoFrom, repoTo); return err }, "read jira issues assigned"},
		{"Created", func(db rowsReader) errors.Error { _, err := jira(db).Created(email, repoFrom, repoTo); return err }, "read jira issues created"},
		{"ResolvedByType", func(db rowsReader) errors.Error {
			_, err := jira(db).ResolvedByType(email, repoFrom, repoTo)
			return err
		}, "read jira issues resolved by type"},
		{"ResolvedByTeam", func(db rowsReader) errors.Error {
			_, err := jira(db).ResolvedByTeam(email, repoFrom, repoTo)
			return err
		}, "read jira issues resolved by team"},
		{"Commits", func(db rowsReader) errors.Error { _, err := github(db).Commits(email, repoFrom, repoTo); return err }, "read github commits"},
		{"Authored", func(db rowsReader) errors.Error { _, err := github(db).Authored(email, repoFrom, repoTo); return err }, "read github pull requests authored"},
		{"PullRequestsWithCommits", func(db rowsReader) errors.Error {
			_, err := github(db).PullRequestsWithCommits(email, repoFrom, repoTo)
			return err
		}, "read github pull requests with the engineer's commits"},
		{"Reviews", func(db rowsReader) errors.Error { _, err := github(db).Reviews(email, repoFrom, repoTo); return err }, "read github reviews"},
		{"CommitsByGroup", func(db rowsReader) errors.Error {
			_, err := github(db).CommitsByGroup(email, repoFrom, repoTo, GroupByTeam)
			return err
		}, "read github commits by group"},
		{"PullRequestsByGroup", func(db rowsReader) errors.Error {
			_, err := github(db).PullRequestsByGroup(email, repoFrom, repoTo, GroupByRepo)
			return err
		}, "read github pull requests by group"},
		{"Providers", func(db rowsReader) errors.Error { _, err := ai(db).Providers(email, firstDay, lastDay); return err }, "read ai activities"},
		{"ToolDecisions", func(db rowsReader) errors.Error { _, err := ai(db).ToolDecisions(email, firstDay, lastDay); return err }, "read ai tool decisions"},
		{"Monthly", func(db rowsReader) errors.Error { _, err := ai(db).Monthly(email, firstDay, lastDay); return err }, "read ai monthly activity"},
		{"ModelCosts", func(db rowsReader) errors.Error { _, err := ai(db).ModelCosts(email, firstDay, lastDay); return err }, "read ai model costs"},
		{"TotalCost", func(db rowsReader) errors.Error { _, err := ai(db).TotalCost(email, firstDay, lastDay); return err }, "read ai total cost"},
		{"MonthlyCosts", func(db rowsReader) errors.Error { _, err := ai(db).MonthlyCosts(email, firstDay, lastDay); return err }, "read ai monthly costs"},
	}
}

// anyAll accepts an All call with any destination and up to six clauses.
func anyAll(db *dalmocks.Dal, err errors.Error) {
	for clauses := 1; clauses <= 6; clauses++ {
		args := make([]interface{}, clauses+1)
		for i := range args {
			args[i] = mock.Anything
		}
		db.On("All", args...).Return(err).Maybe()
	}
}

func TestRepositoryConstructorsRejectNil(t *testing.T) {
	tests := map[string]func() errors.Error{
		"activity": func() errors.Error { _, err := NewActivityRepository(nil); return err },
		"jira":     func() errors.Error { _, err := NewJiraRepository(nil); return err },
		"github":   func() errors.Error { _, err := NewGitHubRepository(nil); return err },
		"ai":       func() errors.Error { _, err := NewAIRepository(nil); return err },
	}
	for name, newRepo := range tests {
		t.Run(name, func(t *testing.T) {
			if err := newRepo(); err == nil {
				t.Error("constructor(nil) = nil error, want error")
			}
		})
	}
}

func TestRepositoryErrorsSayWhatWasRead(t *testing.T) {
	for _, tc := range repoCalls(t) {
		t.Run(tc.name, func(t *testing.T) {
			db := dalmocks.NewDal(t)
			anyAll(db, errors.Default.New("connection refused"))

			err := tc.run(db)

			if err == nil || !strings.Contains(err.Error(), tc.wantMsg) || !strings.Contains(err.Error(), "connection refused") {
				t.Errorf("error = %v, want %q wrapping the cause", err, tc.wantMsg)
			}
		})
	}
}

func TestRepositoryWithNoRowsReturnsZeros(t *testing.T) {
	for _, tc := range repoCalls(t) {
		t.Run(tc.name, func(t *testing.T) {
			db := dalmocks.NewDal(t)
			anyAll(db, nil) // reads no rows

			if err := tc.run(db); err != nil {
				t.Errorf("error = %v, want nil", err)
			}
		})
	}
	db := dalmocks.NewDal(t)
	anyAll(db, nil)
	if got, _ := mustRepo(t, NewGitHubRepository, db).Reviews("abc@arbisoft.com", repoFrom, repoTo); got != (GitHubReviewCounts{}) {
		t.Errorf("Reviews() = %+v, want zeros", got)
	}
	if got, _ := mustRepo(t, NewAIRepository, db).TotalCost("abc@arbisoft.com", "2026-11-03", "2026-11-10"); got != "" {
		t.Errorf("TotalCost() = %q, want empty", got)
	}
	if got, _ := mustRepo(t, NewActivityRepository, db).FirstActivity("abc@arbisoft.com"); got != nil {
		t.Errorf("FirstActivity() = %v, want nil", got)
	}
}

func TestGitHubRepositoryRejectsAnUnknownGroup(t *testing.T) {
	db := dalmocks.NewDal(t) // no expectations: any query fails the test
	r := mustRepo(t, NewGitHubRepository, db)

	if _, err := r.CommitsByGroup("abc@arbisoft.com", repoFrom, repoTo, GitHubGroup(99)); err == nil {
		t.Error("CommitsByGroup(99) = nil error, want error")
	}
	if _, err := r.PullRequestsByGroup("abc@arbisoft.com", repoFrom, repoTo, GitHubGroup(99)); err == nil {
		t.Error("PullRequestsByGroup(99) = nil error, want error")
	}
}
