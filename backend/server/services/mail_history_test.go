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
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
)

func TestEmailHistoryFilters(t *testing.T) {
	from := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 11, 30, 18, 0, 0, 0, time.UTC)
	cases := []struct {
		name   string
		query  EmailHistoryQuery
		expr   []string
		params [][]interface{}
	}{
		{"none", EmailHistoryQuery{}, nil, nil},
		{"status is case-insensitive", EmailHistoryQuery{Status: "failed"}, []string{"status = ?"}, [][]interface{}{{"FAILED"}}},
		{"template and project", EmailHistoryQuery{Template: "alert", ProjectName: " DevLake "},
			[]string{"template = ?", "project_name = ?"}, [][]interface{}{{"alert"}, {"DevLake"}}},
		{"search escapes LIKE wildcards", EmailHistoryQuery{Search: "Ali_100%"},
			[]string{"(LOWER(recipients) LIKE ? OR LOWER(subject) LIKE ?)"}, [][]interface{}{{`%ali\_100\%%`, `%ali\_100\%%`}}},
		{"date range in UTC", EmailHistoryQuery{From: "2026-11-01T05:00:00+05:00", To: "2026-11-30T18:00:00Z"},
			[]string{"created_at >= ?", "created_at <= ?"}, [][]interface{}{{from}, {to}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			clauses, err := emailHistoryFilters(&tc.query)

			require.Nil(t, err)
			require.Len(t, clauses, len(tc.expr))
			for i, c := range clauses {
				require.Equal(t, dal.WhereClause, c.Type)
				w := whereOf(c)
				assert.Equal(t, tc.expr[i], w.Expr)
				assert.Equal(t, tc.params[i], w.Params)
			}
		})
	}
}

func TestEmailHistoryFiltersRejectBadValues(t *testing.T) {
	cases := []struct {
		name  string
		query EmailHistoryQuery
		want  string
	}{
		{"status", EmailHistoryQuery{Status: "BOUNCED"}, "invalid status"},
		{"from", EmailHistoryQuery{From: "2026-11-01"}, "invalid from: expected RFC 3339"},
		{"to", EmailHistoryQuery{To: "yesterday"}, "invalid to: expected RFC 3339"},
		{"range", EmailHistoryQuery{From: "2026-11-02T00:00:00Z", To: "2026-11-01T00:00:00Z"}, "from is after to"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := emailHistoryFilters(&tc.query)

			require.NotNil(t, err)
			assert.Equal(t, errors.BadInput, err.GetType())
			assert.Contains(t, err.Error(), tc.want)
		})
	}
}

func TestMailHistoryListOmitsContentCapsThePageAndSorts(t *testing.T) {
	db := dalmocks.NewDal(t)
	svc, err := NewMailHistoryService(db)
	require.Nil(t, err)
	var listClauses []dal.Clause
	db.On("Count", mock.Anything, mock.Anything).Return(int64(250), nil).Once()
	db.On("All", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).
		Run(func(args mock.Arguments) {
			for _, a := range args[1:] {
				listClauses = append(listClauses, a.(dal.Clause))
			}
			*args.Get(0).(*[]*models.EmailHistory) = []*models.EmailHistory{{ID: 9}}
		}).Return(nil).Once()

	rows, count, err := svc.List(&EmailHistoryQuery{
		Pagination: Pagination{Page: 2, PageSize: 500},
		SortQuery:  SortQuery{SortBy: "sentOn", SortOrder: "asc"},
		Status:     "SENT",
	})

	require.Nil(t, err)
	assert.Equal(t, int64(250), count)
	assert.Equal(t, []*models.EmailHistory{{ID: 9}}, rows)
	byType := map[string]interface{}{}
	for _, c := range listClauses {
		byType[c.Type] = c.Data
	}
	assert.Equal(t, dal.DalClause{Expr: emailHistoryListColumns}, byType[dal.SelectClause])
	assert.NotContains(t, emailHistoryListColumns, "content")
	assert.Equal(t, "_devlake_email_history.sent_on IS NULL, _devlake_email_history.sent_on ASC, _devlake_email_history.id ASC", byType[dal.OrderbyClause])
	assert.Equal(t, maxEmailHistoryPageSize, byType[dal.OffsetClause], "page 2 at the capped size")
	assert.Equal(t, maxEmailHistoryPageSize, byType[dal.LimitClause])
}

func TestMailHistoryListRejectsAnUnknownSort(t *testing.T) {
	svc, err := NewMailHistoryService(dalmocks.NewDal(t))
	require.Nil(t, err)

	_, _, err = svc.List(&EmailHistoryQuery{SortQuery: SortQuery{SortBy: "content"}})

	require.NotNil(t, err)
	assert.Equal(t, errors.BadInput, err.GetType())
}

func TestMailHistoryGet(t *testing.T) {
	notFound := errors.NotFound.New("record not found")
	dbErr := errors.Default.New("db down")
	cases := []struct {
		name     string
		firstErr errors.Error
		notFound bool
		kind     *errors.Type
	}{
		{"found", nil, false, nil},
		{"not found", notFound, true, errors.NotFound},
		{"db error", dbErr, false, errors.Default},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db := dalmocks.NewDal(t)
			db.On("First", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
				args.Get(0).(*models.EmailHistory).ID = 42
			}).Return(tc.firstErr).Once()
			db.On("IsErrorNotFound", mock.Anything).Return(tc.notFound).Once()
			svc, err := NewMailHistoryService(db)
			require.Nil(t, err)

			row, err := svc.Get(42)

			if tc.kind == nil {
				require.Nil(t, err)
				assert.Equal(t, uint64(42), row.ID)
				return
			}
			require.NotNil(t, err)
			assert.Equal(t, tc.kind, err.GetType())
		})
	}
}

func TestNewMailHistoryServiceRejectsNil(t *testing.T) {
	_, err := NewMailHistoryService(nil)
	assert.NotNil(t, err)
}
