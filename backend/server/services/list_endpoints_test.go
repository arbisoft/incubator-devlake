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
	"net/http"
	"testing"

	"github.com/go-playground/validator/v10"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/services"
	"github.com/apache/incubator-devlake/impls/logruslog"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
)

type capturedQueries struct {
	count []dal.Clause
	list  []dal.Clause
}

func useCapturingDal(t *testing.T) *capturedQueries {
	t.Helper()
	captured := &capturedQueries{}
	testDal := dalmocks.NewDal(t)
	testDal.On("Count", mock.Anything).Run(func(args mock.Arguments) {
		captured.count = args.Get(0).([]dal.Clause)
	}).Return(int64(0), nil).Maybe()
	testDal.On("All", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		captured.list = args.Get(1).([]dal.Clause)
	}).Return(nil).Maybe()

	previousDb, previousManager, previousValidator, previousLogger := db, bpManager, vld, logger
	db = testDal
	bpManager = services.NewBlueprintManager(testDal)
	vld = validator.New()
	logger = logruslog.Global
	t.Cleanup(func() {
		db, bpManager, vld, logger = previousDb, previousManager, previousValidator, previousLogger
	})
	return captured
}

func clausesOfType(clauses []dal.Clause, clauseType string) []dal.Clause {
	matched := make([]dal.Clause, 0)
	for _, clause := range clauses {
		if clause.Type == clauseType {
			matched = append(matched, clause)
		}
	}
	return matched
}

func orderByOf(t *testing.T, clauses []dal.Clause) string {
	t.Helper()
	orders := clausesOfType(clauses, dal.OrderbyClause)
	if !assert.Len(t, orders, 1) {
		return ""
	}
	return orders[0].Data.(string)
}

func whereExprs(clauses []dal.Clause) []dal.DalClause {
	wheres := make([]dal.DalClause, 0)
	for _, clause := range clausesOfType(clauses, dal.WhereClause) {
		wheres = append(wheres, clause.Data.(dal.DalClause))
	}
	return wheres
}

type sortCase struct {
	name      string
	sortBy    string
	sortOrder string
	wantOrder string
	wantErr   bool
}

func runSortCases(t *testing.T, cases []sortCase, run func(SortQuery) (*capturedQueries, errors.Error)) {
	t.Helper()
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			captured, err := run(SortQuery{SortBy: tc.sortBy, SortOrder: tc.sortOrder})
			if tc.wantErr {
				if assert.Error(t, err) {
					assert.Equal(t, http.StatusBadRequest, err.GetType().GetHttpCode())
				}
				assert.Nil(t, captured.list, "no list query may run for invalid input")
				return
			}
			assert.NoError(t, err)
			assert.Equal(t, tc.wantOrder, orderByOf(t, captured.list))
			assert.Empty(t, clausesOfType(captured.count, dal.OrderbyClause))
		})
	}
}

func TestGetProjectsSortAndKeyword(t *testing.T) {
	const lastRunJoin = "lr.last_run_at"
	cases := []sortCase{
		{name: "default order", wantOrder: "projects.created_at DESC, projects.name DESC"},
		{name: "name asc", sortBy: "name", sortOrder: "asc", wantOrder: "projects.name ASC"},
		{name: "name desc", sortBy: "name", sortOrder: "desc", wantOrder: "projects.name DESC"},
		{name: "createdAt asc", sortBy: "createdAt", sortOrder: "asc", wantOrder: "projects.created_at ASC, projects.name ASC"},
		{name: "createdAt desc", sortBy: "createdAt", sortOrder: "desc", wantOrder: "projects.created_at DESC, projects.name DESC"},
		{name: "lastRunAt asc", sortBy: "lastRunAt", sortOrder: "asc", wantOrder: lastRunJoin + " IS NULL, " + lastRunJoin + " ASC, projects.name ASC"},
		{name: "lastRunAt desc", sortBy: "lastRunAt", sortOrder: "desc", wantOrder: lastRunJoin + " IS NULL, " + lastRunJoin + " DESC, projects.name DESC"},
		{name: "sortOrder defaults to desc", sortBy: "name", wantOrder: "projects.name DESC"},
		{name: "sortOrder is case-insensitive", sortBy: "name", sortOrder: "ASC", wantOrder: "projects.name ASC"},
		{name: "invalid sortBy", sortBy: "name; DROP TABLE projects", wantErr: true},
		{name: "invalid sortOrder", sortBy: "name", sortOrder: "sideways", wantErr: true},
	}
	runSortCases(t, cases, func(sort SortQuery) (*capturedQueries, errors.Error) {
		captured := useCapturingDal(t)
		_, _, err := GetProjects(&ProjectQuery{SortQuery: sort})
		return captured, err
	})

	t.Run("join only for lastRunAt and never in the count", func(t *testing.T) {
		captured := useCapturingDal(t)
		_, _, err := GetProjects(&ProjectQuery{SortQuery: SortQuery{SortBy: "lastRunAt"}})
		assert.NoError(t, err)
		assert.Len(t, clausesOfType(captured.list, dal.JoinClause), 1)
		assert.Empty(t, clausesOfType(captured.count, dal.JoinClause))

		captured = useCapturingDal(t)
		_, _, err = GetProjects(&ProjectQuery{})
		assert.NoError(t, err)
		assert.Empty(t, clausesOfType(captured.list, dal.JoinClause))
	})

	t.Run("keyword is lowercased", func(t *testing.T) {
		captured := useCapturingDal(t)
		keyword := "FoO"
		_, _, err := GetProjects(&ProjectQuery{Keyword: &keyword})
		assert.NoError(t, err)
		wheres := whereExprs(captured.list)
		if assert.Len(t, wheres, 1) {
			assert.Equal(t, "LOWER(name) LIKE ?", wheres[0].Expr)
			assert.Equal(t, []interface{}{"%foo%"}, wheres[0].Params)
		}
		assert.Len(t, whereExprs(captured.count), 1)
	})
}

func TestGetApiKeysSortAndKeyword(t *testing.T) {
	cases := []sortCase{
		{name: "default order", wantOrder: "_devlake_api_keys.created_at DESC, _devlake_api_keys.id DESC"},
		{name: "name asc", sortBy: "name", sortOrder: "asc", wantOrder: "_devlake_api_keys.name ASC, _devlake_api_keys.id ASC"},
		{name: "name desc", sortBy: "name", sortOrder: "desc", wantOrder: "_devlake_api_keys.name DESC, _devlake_api_keys.id DESC"},
		{name: "expiredAt asc", sortBy: "expiredAt", sortOrder: "asc", wantOrder: "_devlake_api_keys.expired_at ASC, _devlake_api_keys.id ASC"},
		{name: "expiredAt desc", sortBy: "expiredAt", sortOrder: "desc", wantOrder: "_devlake_api_keys.expired_at DESC, _devlake_api_keys.id DESC"},
		{name: "createdAt asc", sortBy: "createdAt", sortOrder: "asc", wantOrder: "_devlake_api_keys.created_at ASC, _devlake_api_keys.id ASC"},
		{name: "createdAt desc", sortBy: "createdAt", sortOrder: "desc", wantOrder: "_devlake_api_keys.created_at DESC, _devlake_api_keys.id DESC"},
		{name: "invalid sortBy", sortBy: "apiKey", wantErr: true},
		{name: "invalid sortOrder", sortBy: "name", sortOrder: "up", wantErr: true},
	}
	runSortCases(t, cases, func(sort SortQuery) (*capturedQueries, errors.Error) {
		captured := useCapturingDal(t)
		_, _, err := GetApiKeys(&ApiKeysQuery{SortQuery: sort})
		return captured, err
	})

	t.Run("keyword is lowercased and the type filter stays", func(t *testing.T) {
		captured := useCapturingDal(t)
		_, _, err := GetApiKeys(&ApiKeysQuery{Keyword: "CI-Key"})
		assert.NoError(t, err)
		wheres := whereExprs(captured.list)
		if assert.Len(t, wheres, 2) {
			assert.Equal(t, "type = ?", wheres[0].Expr)
			assert.Equal(t, "LOWER(name) LIKE ?", wheres[1].Expr)
			assert.Equal(t, []interface{}{"%ci-key%"}, wheres[1].Params)
		}
		assert.Len(t, whereExprs(captured.count), 2)
	})
}

func TestGetDbPipelinesSort(t *testing.T) {
	cases := []sortCase{
		{name: "default order", wantOrder: "_devlake_pipelines.id DESC"},
		{name: "id asc", sortBy: "id", sortOrder: "asc", wantOrder: "_devlake_pipelines.id ASC"},
		{name: "id desc", sortBy: "id", sortOrder: "desc", wantOrder: "_devlake_pipelines.id DESC"},
		{name: "beganAt asc", sortBy: "beganAt", sortOrder: "asc", wantOrder: "_devlake_pipelines.began_at ASC, _devlake_pipelines.id ASC"},
		{name: "beganAt desc", sortBy: "beganAt", sortOrder: "desc", wantOrder: "_devlake_pipelines.began_at DESC, _devlake_pipelines.id DESC"},
		{name: "finishedAt asc", sortBy: "finishedAt", sortOrder: "asc", wantOrder: "_devlake_pipelines.finished_at ASC, _devlake_pipelines.id ASC"},
		{name: "finishedAt desc", sortBy: "finishedAt", sortOrder: "desc", wantOrder: "_devlake_pipelines.finished_at DESC, _devlake_pipelines.id DESC"},
		{name: "invalid sortBy", sortBy: "status", wantErr: true},
		{name: "invalid sortOrder", sortBy: "id", sortOrder: "random", wantErr: true},
	}
	runSortCases(t, cases, func(sort SortQuery) (*capturedQueries, errors.Error) {
		captured := useCapturingDal(t)
		_, _, err := GetDbPipelines(&PipelineQuery{SortQuery: sort})
		return captured, err
	})
}

func TestGetBlueprintsSortAndKeyword(t *testing.T) {
	cases := []sortCase{
		{name: "default order", wantOrder: "_devlake_blueprints.id DESC"},
		{name: "name asc", sortBy: "name", sortOrder: "asc", wantOrder: "_devlake_blueprints.name ASC, _devlake_blueprints.id ASC"},
		{name: "name desc", sortBy: "name", sortOrder: "desc", wantOrder: "_devlake_blueprints.name DESC, _devlake_blueprints.id DESC"},
		{name: "createdAt asc", sortBy: "createdAt", sortOrder: "asc", wantOrder: "_devlake_blueprints.created_at ASC, _devlake_blueprints.id ASC"},
		{name: "createdAt desc", sortBy: "createdAt", sortOrder: "desc", wantOrder: "_devlake_blueprints.created_at DESC, _devlake_blueprints.id DESC"},
		{name: "invalid sortBy", sortBy: "id", wantErr: true},
		{name: "invalid sortOrder", sortBy: "name", sortOrder: "north", wantErr: true},
	}
	runSortCases(t, cases, func(sort SortQuery) (*capturedQueries, errors.Error) {
		captured := useCapturingDal(t)
		_, _, err := GetBlueprints(&BlueprintQuery{SortQuery: sort}, false)
		return captured, err
	})

	t.Run("keyword matches name or project name, lowercased", func(t *testing.T) {
		captured := useCapturingDal(t)
		_, _, err := GetBlueprints(&BlueprintQuery{Keyword: "MyProj"}, false)
		assert.NoError(t, err)
		for _, clauses := range [][]dal.Clause{captured.list, captured.count} {
			wheres := whereExprs(clauses)
			if assert.Len(t, wheres, 1) {
				assert.Equal(t, "(LOWER(_devlake_blueprints.name) LIKE ? OR LOWER(_devlake_blueprints.project_name) LIKE ?)", wheres[0].Expr)
				assert.Equal(t, []interface{}{"%myproj%", "%myproj%"}, wheres[0].Params)
			}
		}
	})
}

func TestSortQueryOrderByNeverEchoesInput(t *testing.T) {
	_, err := SortQuery{SortBy: "name'; DROP TABLE x;--"}.orderBy(projectSortSpec)
	if assert.Error(t, err) {
		assert.NotContains(t, err.Error(), "DROP")
	}
	_, err = SortQuery{SortOrder: "desc; DROP"}.orderBy(projectSortSpec)
	if assert.Error(t, err) {
		assert.NotContains(t, err.Error(), "DROP")
	}
}
