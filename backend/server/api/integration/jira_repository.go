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
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
)

// JiraAssignedCounts summarizes the Jira issues assigned to an engineer.
type JiraAssignedCounts struct {
	// IssuesResolved, StoryPointsResolved and AvgResolutionHours cover the issues resolved in the window.
	IssuesResolved      int64
	StoryPointsResolved float64
	AvgResolutionHours  float64
	// IssuesInProgress and IssuesTodo are the current counts, whatever the window.
	IssuesInProgress int64
	IssuesTodo       int64
}

// JiraTypeRow is the resolved work of one ticket type.
type JiraTypeRow struct {
	IssueType      string
	IssuesResolved int64   `gorm:"column:resolved_count"`
	StoryPoints    float64 `gorm:"column:points_total"`
}

// JiraTeamRow is the resolved work in one DevLake project.
type JiraTeamRow struct {
	Team           string
	IssuesResolved int64   `gorm:"column:resolved_count"`
	StoryPoints    float64 `gorm:"column:points_total"`
}

// JiraRepository reads Jira issues from the domain tables. It is safe for concurrent use.
type JiraRepository struct {
	db rowsReader
}

// NewJiraRepository returns a repository that reads through db, which must not be nil.
func NewJiraRepository(db rowsReader) (*JiraRepository, errors.Error) {
	if db == nil {
		return nil, errors.Default.New("jira repository: nil db")
	}
	return &JiraRepository{db: db}, nil
}

// Assigned returns the counts of the issues assigned to email. An engineer with no issues gets zeros.
func (r *JiraRepository) Assigned(email string, from, to time.Time) (JiraAssignedCounts, errors.Error) {
	var rows []JiraAssignedCounts
	if err := r.db.All(&rows,
		dal.Select(`COALESCE(SUM(i.resolution_date >= ? AND i.resolution_date < ?), 0) AS issues_resolved,
			COALESCE(SUM(CASE WHEN i.resolution_date >= ? AND i.resolution_date < ? THEN i.story_point END), 0) AS story_points_resolved,
			COALESCE(SUM(i.status = 'IN_PROGRESS'), 0) AS issues_in_progress,
			COALESCE(SUM(i.status = 'TODO'), 0) AS issues_todo,
			COALESCE(AVG(CASE WHEN i.resolution_date >= ? AND i.resolution_date < ? THEN TIMESTAMPDIFF(MINUTE, i.created_date, i.resolution_date) END), 0) / 60 AS avg_resolution_hours`,
			from, to, from, to, from, to),
		dal.From("issues i JOIN accounts a ON a.id = i.assignee_id"),
		dal.Where("i.id LIKE 'jira:%' AND LOWER(a.email) = ?", email),
	); err != nil {
		return JiraAssignedCounts{}, errors.Default.Wrap(err, "read jira issues assigned to the engineer")
	}
	return singleRow(rows), nil
}

// Created counts the issues email created in the window.
func (r *JiraRepository) Created(email string, from, to time.Time) (int64, errors.Error) {
	var rows []struct{ IssuesCreated int64 }
	if err := r.db.All(&rows,
		dal.Select("COUNT(*) AS issues_created"),
		dal.From("issues i JOIN accounts a ON a.id = i.creator_id"),
		dal.Where("i.id LIKE 'jira:%' AND LOWER(a.email) = ? AND i.created_date >= ? AND i.created_date < ?", email, from, to),
	); err != nil {
		return 0, errors.Default.Wrap(err, "read jira issues created by the engineer")
	}
	return singleRow(rows).IssuesCreated, nil
}

// ResolvedByType splits the issues assigned to email and resolved in the window by ticket type, sorted by type.
// An issue with no type is UNKNOWN.
func (r *JiraRepository) ResolvedByType(email string, from, to time.Time) ([]JiraTypeRow, errors.Error) {
	var rows []JiraTypeRow
	if err := r.db.All(&rows,
		dal.Select(`COALESCE(NULLIF(i.type, ''), NULLIF(i.original_type, ''), 'UNKNOWN') AS issue_type,
			COUNT(*) AS resolved_count, COALESCE(SUM(i.story_point), 0) AS points_total`),
		dal.From("issues i JOIN accounts a ON a.id = i.assignee_id"),
		dal.Where("i.id LIKE 'jira:%' AND LOWER(a.email) = ? AND i.resolution_date >= ? AND i.resolution_date < ?", email, from, to),
		dal.Groupby("issue_type"),
		dal.Orderby("issue_type"),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read jira issues resolved by type")
	}
	return rows, nil
}

// ResolvedByTeam splits the same issues by DevLake project, sorted by project. An issue on several boards of one
// project counts once there.
func (r *JiraRepository) ResolvedByTeam(email string, from, to time.Time) ([]JiraTeamRow, errors.Error) {
	var rows []JiraTeamRow
	if err := r.db.All(&rows,
		dal.Select("t.team AS team, COUNT(*) AS resolved_count, COALESCE(SUM(t.story_point), 0) AS points_total"),
		dal.From("(SELECT DISTINCT pm.project_name AS team, i.id, i.story_point FROM issues i"+
			" JOIN accounts a ON a.id = i.assignee_id JOIN board_issues bi ON bi.issue_id = i.id"+
			" JOIN project_mapping pm ON pm.row_id = bi.board_id AND pm.`table` = 'boards'"+
			" WHERE i.id LIKE 'jira:%' AND LOWER(a.email) = ? AND i.resolution_date >= ? AND i.resolution_date < ?) t",
			email, from, to),
		dal.Groupby("t.team"),
		dal.Orderby("t.team"),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read jira issues resolved by team")
	}
	return rows, nil
}
