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

package services

import (
	"fmt"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
)

const maxEmailHistoryPageSize = 100 // a page of rows without content stays small

// emailHistoryListColumns is every column except content and text_content, which only the detail returns.
const emailHistoryListColumns = "id, sender, recipients, subject, status, sent_on, sent_by, template, project_name, " +
	"source, source_id, provider, provider_message_id, error_message, attempts, next_attempt_at, created_at, updated_at"

var emailHistorySortSpec = sortSpec{
	columns: map[string]string{
		"createdAt": "_devlake_email_history.created_at",
		"sentOn":    "_devlake_email_history.sent_on",
		"status":    "_devlake_email_history.status",
		"template":  "_devlake_email_history.template",
		"subject":   "_devlake_email_history.subject",
	},
	defaultColumn: "_devlake_email_history.created_at",
	tieBreaker:    "_devlake_email_history.id",
	nullsLastKeys: map[string]bool{"sentOn": true},
}

var (
	emailStatuses  = map[string]bool{models.EmailStatusQueued: true, models.EmailStatusSent: true, models.EmailStatusFailed: true}
	likeEscapeRepl = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
)

// EmailHistoryQuery is the filter, sort and page for GET /mail/history.
type EmailHistoryQuery struct {
	Pagination
	SortQuery
	Status      string `form:"status"`      // QUEUED, SENT or FAILED
	Template    string `form:"template"`    // for example alert or report
	ProjectName string `form:"projectName"` // exact match
	Search      string `form:"search"`      // case-insensitive match on recipients or subject
	From        string `form:"from"`        // RFC 3339; created_at at or after
	To          string `form:"to"`          // RFC 3339; created_at at or before
}

// MailHistoryService reads _devlake_email_history for the admin screen.
type MailHistoryService struct {
	db dal.Dal
}

// NewMailHistoryService returns the history reader over db, which must not be nil.
func NewMailHistoryService(db dal.Dal) (*MailHistoryService, errors.Error) {
	if db == nil {
		return nil, errors.Default.New("mail history service: nil dal")
	}
	return &MailHistoryService{db: db}, nil
}

// List returns one page of history rows, newest first by default, without content or text_content,
// and the total count for the filter. A bad filter or sort value is a BadInput error naming it.
func (s *MailHistoryService) List(q *EmailHistoryQuery) ([]*models.EmailHistory, int64, errors.Error) {
	filters, err := emailHistoryFilters(q)
	if err != nil {
		return nil, 0, err
	}
	orderBy, err := q.orderBy(emailHistorySortSpec)
	if err != nil {
		return nil, 0, err
	}
	clauses := append([]dal.Clause{dal.From(&models.EmailHistory{})}, filters...)
	count, err := s.db.Count(clauses...)
	if err != nil {
		return nil, 0, errors.Default.Wrap(err, "count email history")
	}
	pageSize := q.GetPageSize()
	if pageSize > maxEmailHistoryPageSize {
		pageSize = maxEmailHistoryPageSize
	}
	clauses = append(clauses,
		dal.Select(emailHistoryListColumns),
		dal.Orderby(orderBy),
		dal.Offset((q.GetPage()-1)*pageSize),
		dal.Limit(pageSize),
	)
	rows := make([]*models.EmailHistory, 0, pageSize)
	if err := s.db.All(&rows, clauses...); err != nil {
		return nil, 0, errors.Default.Wrap(err, "list email history")
	}
	return rows, count, nil
}

// Get returns one row with its content, or a NotFound error.
func (s *MailHistoryService) Get(id uint64) (*models.EmailHistory, errors.Error) {
	row := &models.EmailHistory{}
	err := s.db.First(row, dal.Where("id = ?", id))
	if s.db.IsErrorNotFound(err) {
		return nil, errors.NotFound.New(fmt.Sprintf("email %d not found", id))
	}
	if err != nil {
		return nil, errors.Default.Wrap(err, fmt.Sprintf("get email history id=%d", id))
	}
	return row, nil
}

// emailHistoryFilters turns the query into WHERE clauses. It does no I/O.
func emailHistoryFilters(q *EmailHistoryQuery) ([]dal.Clause, errors.Error) {
	var clauses []dal.Clause
	if status := strings.ToUpper(strings.TrimSpace(q.Status)); status != "" {
		if !emailStatuses[status] {
			return nil, errors.BadInput.New("invalid status: expected QUEUED, SENT or FAILED")
		}
		clauses = append(clauses, dal.Where("status = ?", status))
	}
	if template := strings.TrimSpace(q.Template); template != "" {
		clauses = append(clauses, dal.Where("template = ?", template))
	}
	if project := strings.TrimSpace(q.ProjectName); project != "" {
		clauses = append(clauses, dal.Where("project_name = ?", project))
	}
	if search := strings.ToLower(strings.TrimSpace(q.Search)); search != "" {
		pattern := "%" + likeEscapeRepl.Replace(search) + "%"
		clauses = append(clauses, dal.Where("(LOWER(recipients) LIKE ? OR LOWER(subject) LIKE ?)", pattern, pattern))
	}
	from, err := parseRFC3339("from", q.From)
	if err != nil {
		return nil, err
	}
	to, err := parseRFC3339("to", q.To)
	if err != nil {
		return nil, err
	}
	if from != nil && to != nil && from.After(*to) {
		return nil, errors.BadInput.New("invalid range: from is after to")
	}
	if from != nil {
		clauses = append(clauses, dal.Where("created_at >= ?", *from))
	}
	if to != nil {
		clauses = append(clauses, dal.Where("created_at <= ?", *to))
	}
	return clauses, nil
}

func parseRFC3339(field, raw string) (*time.Time, errors.Error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return nil, errors.BadInput.New(fmt.Sprintf("invalid %s: expected RFC 3339, for example 2026-11-01T00:00:00Z", field))
	}
	t = t.UTC()
	return &t, nil
}
