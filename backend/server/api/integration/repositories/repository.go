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
	"regexp"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
)

// rowsReader is the one DAL method the repositories need. dal.Dal satisfies it.
type rowsReader interface {
	All(dst interface{}, clauses ...dal.Clause) errors.Error
}

var _ rowsReader = (dal.Dal)(nil)

// The sources the Integration Service reads today. A source is the prefix DevLake gives the domain ids of one tool.
const (
	SourceJira   = "jira"
	SourceGitHub = "github"
)

// sourcePattern is what a source must look like: a lowercase tool name such as jira, github, gitlab or plane.
var sourcePattern = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

// idLike validates source and returns the LIKE pattern for its domain ids, for example "github:%". The pattern is
// always bound as a query parameter, never written into the SQL.
func idLike(source string) (string, errors.Error) {
	if !sourcePattern.MatchString(source) {
		return "", errors.Default.New("repository source must be a lowercase tool name such as jira or github")
	}
	return source + ":%", nil
}

// The repositories match emails case-insensitively and expect them lowercased, because the stored emails are not.
// Every window is half-open, [from, to), except the AI ones, which are inclusive day ranges.

// Activity reads when an engineer was first active. It is safe for concurrent use.
type Activity struct {
	db rowsReader
}

// NewActivity returns a repository that reads through db, which must not be nil.
func NewActivity(db rowsReader) (*Activity, errors.Error) {
	if db == nil {
		return nil, errors.Default.New("activity repository: nil db")
	}
	return &Activity{db: db}, nil
}

// FirstActivity returns the earliest Jira, GitHub or AI activity recorded for email, or nil when there is none.
func (r *Activity) FirstActivity(email string) (*time.Time, errors.Error) {
	var rows []struct{ Joined *time.Time }
	if err := r.db.All(&rows,
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

// singleRow returns the single row an aggregate query reads, or the zero value when it read none.
func singleRow[T any](rows []T) T {
	var zero T
	if len(rows) == 0 {
		return zero
	}
	return rows[0]
}
