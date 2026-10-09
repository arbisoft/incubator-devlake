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

package service

import (
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	coremodels "github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/core/models/common"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
)

func TestNormalizeOtelProjectNames(t *testing.T) {
	overLimitProjectNames := make([]string, maxOtelProjectsPerConnection+1)
	for index := range overLimitProjectNames {
		overLimitProjectNames[index] = strings.Repeat("p", index+1)
	}

	testCases := []struct {
		name    string
		input   []string
		expect  []string
		wantErr bool
	}{
		{
			name:   "trims deduplicates and sorts project names",
			input:  []string{" Mobile ", "Core", "Mobile"},
			expect: []string{"Core", "Mobile"},
		},
		{
			name:    "requires a project",
			input:   []string{},
			wantErr: true,
		},
		{
			name:    "rejects blank project names",
			input:   []string{"Core", " "},
			wantErr: true,
		},
		{
			name:    "rejects more than the project limit",
			input:   overLimitProjectNames,
			wantErr: true,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			actual, err := normalizeOtelProjectNames(testCase.input)
			if testCase.wantErr {
				if err == nil {
					t.Fatal("normalizeOtelProjectNames() error = nil, want an error")
				}
				return
			}
			if err != nil {
				t.Fatalf("normalizeOtelProjectNames() error = %v", err)
			}
			if !reflect.DeepEqual(actual, testCase.expect) {
				t.Fatalf("normalizeOtelProjectNames() = %v, want %v", actual, testCase.expect)
			}
		})
	}
}

func TestValidateOtelProjectNamesExist(t *testing.T) {
	testCases := []struct {
		name     string
		names    []string
		projects []*coremodels.Project
		wantErr  bool
	}{
		{
			name:  "accepts all selected projects",
			names: []string{"Core", "Mobile"},
			projects: []*coremodels.Project{
				{BaseProject: coremodels.BaseProject{Name: "Core"}},
				{BaseProject: coremodels.BaseProject{Name: "Mobile"}},
			},
		},
		{
			name:  "rejects a selected project that no longer exists",
			names: []string{"Core", "Mobile"},
			projects: []*coremodels.Project{
				{BaseProject: coremodels.BaseProject{Name: "Core"}},
			},
			wantErr: true,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := validateOtelProjectNamesExist(testCase.names, testCase.projects)
			if testCase.wantErr {
				if err == nil {
					t.Fatal("validateOtelProjectNamesExist() error = nil, want an error")
				}
				if status := err.GetType().GetHttpCode(); status != http.StatusBadRequest {
					t.Fatalf("validateOtelProjectNamesExist() status = %d, want %d", status, http.StatusBadRequest)
				}
				return
			}
			if err != nil {
				t.Fatalf("validateOtelProjectNamesExist() error = %v, want nil", err)
			}
		})
	}
}

func TestValidateOtelProjectPlacementRemovalState(t *testing.T) {
	testCases := []struct {
		name            string
		connectionState string
		placementCount  int
		wantErr         bool
	}{
		{
			name:            "rejects the final placement of an active connection",
			connectionState: models.OtelConnectionStatusActive,
			placementCount:  1,
			wantErr:         true,
		},
		{
			name:            "allows removal from a shared active connection",
			connectionState: models.OtelConnectionStatusActive,
			placementCount:  2,
		},
		{
			name:            "allows removal from a revoked connection",
			connectionState: models.OtelConnectionStatusRevoked,
			placementCount:  1,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := validateOtelProjectPlacementRemovalState(testCase.connectionState, testCase.placementCount)
			if testCase.wantErr {
				if err == nil {
					t.Fatal("validateOtelProjectPlacementRemovalState() error = nil, want an error")
				}
				if status := err.GetType().GetHttpCode(); status != http.StatusConflict {
					t.Fatalf("validateOtelProjectPlacementRemovalState() status = %d, want %d", status, http.StatusConflict)
				}
				return
			}
			if err != nil {
				t.Fatalf("validateOtelProjectPlacementRemovalState() error = %v, want nil", err)
			}
		})
	}
}

func hasWriteLock(clauses []dal.Clause) bool {
	for _, clause := range clauses {
		if clause.Type == dal.LockClause && clause.Data.([]bool)[0] {
			return true
		}
	}
	return false
}

func whereOf(clauses []dal.Clause) dal.DalClause {
	for _, clause := range clauses {
		if clause.Type == dal.WhereClause {
			return clause.Data.(dal.DalClause)
		}
	}
	return dal.DalClause{}
}

// expectOtelPlacementQueries serves the project's placements unlocked and each connection's placements only with a write lock.
func expectOtelPlacementQueries(t *testing.T, tx *dalmocks.Transaction, projectPlacements []*models.OtelConnectionProject, connectionPlacements map[uint64][]string) {
	tx.On("All", mock.AnythingOfType("*[]*models.OtelConnectionProject"), mock.Anything).Run(func(args mock.Arguments) {
		placements := args.Get(0).(*[]*models.OtelConnectionProject)
		clauses := args.Get(1).([]dal.Clause)
		where := whereOf(clauses)
		switch where.Expr {
		case "project_name = ?":
			*placements = projectPlacements
		case "connection_id = ?":
			if !hasWriteLock(clauses) {
				t.Fatalf("connection placements read without a write lock: %#v", clauses)
			}
			for _, name := range connectionPlacements[where.Params[0].(uint64)] {
				*placements = append(*placements, &models.OtelConnectionProject{ConnectionId: where.Params[0].(uint64), ProjectName: name})
			}
		default:
			t.Fatalf("unexpected placement query %q", where.Expr)
		}
	}).Return(nil)
}

func expectOtelConnectionLock(t *testing.T, tx *dalmocks.Transaction, connections ...models.OtelConnection) {
	tx.On("All", mock.AnythingOfType("*[]*models.OtelConnection"), mock.Anything).Run(func(args mock.Arguments) {
		if !hasWriteLock(args.Get(1).([]dal.Clause)) {
			t.Fatalf("connections read without a write lock: %#v", args.Get(1))
		}
		locked := args.Get(0).(*[]*models.OtelConnection)
		for index := range connections {
			*locked = append(*locked, &connections[index])
		}
	}).Return(nil).Once()
}

func TestDeleteProjectPlacementsInTransaction(t *testing.T) {
	hiddenAt := time.Now()
	testCases := []struct {
		name                 string
		connection           models.OtelConnection
		connectionPlacements []string
		wantErr              bool
	}{
		{
			name:                 "deletes placements of a shared active connection",
			connection:           models.OtelConnection{Status: models.OtelConnectionStatusActive},
			connectionPlacements: []string{"Core", "Mobile"},
		},
		{
			name:                 "deletes placements of a revoked and hidden connection",
			connection:           models.OtelConnection{Status: models.OtelConnectionStatusRevoked, HiddenAt: &hiddenAt},
			connectionPlacements: []string{"Core"},
		},
		{
			name:                 "skips a connection whose placement moved before its lock was granted",
			connection:           models.OtelConnection{Status: models.OtelConnectionStatusActive},
			connectionPlacements: []string{"Mobile"},
		},
		{
			name:                 "rejects the final placement of an active connection",
			connection:           models.OtelConnection{Status: models.OtelConnectionStatusActive},
			connectionPlacements: []string{"Core"},
			wantErr:              true,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			connection := testCase.connection
			connection.Model = common.Model{ID: 7}
			tx := dalmocks.NewTransaction(t)
			expectOtelPlacementQueries(t, tx, []*models.OtelConnectionProject{{ConnectionId: 7, ProjectName: "Core"}}, map[uint64][]string{7: testCase.connectionPlacements})
			expectOtelConnectionLock(t, tx, connection)

			var deleteClauses []dal.Clause
			if !testCase.wantErr {
				tx.On("Delete", mock.AnythingOfType("*models.OtelConnectionProject"), mock.Anything).Run(func(args mock.Arguments) {
					deleteClauses = args.Get(1).([]dal.Clause)
				}).Return(nil).Once()
			}

			err := DeleteProjectPlacementsInTransaction(tx, "Core")
			if testCase.wantErr {
				if err == nil {
					t.Fatal("DeleteProjectPlacementsInTransaction() error = nil, want an error")
				}
				if status := err.GetType().GetHttpCode(); status != http.StatusConflict {
					t.Fatalf("DeleteProjectPlacementsInTransaction() status = %d, want %d", status, http.StatusConflict)
				}
				return
			}
			if err != nil {
				t.Fatalf("DeleteProjectPlacementsInTransaction() error = %v, want nil", err)
			}
			where := deleteClauses[0].Data.(dal.DalClause)
			if where.Expr != "project_name = ?" || len(where.Params) != 1 || where.Params[0] != "Core" {
				t.Fatalf("placement delete filter = (%q, %#v), want project_name = ? with Core", where.Expr, where.Params)
			}
		})
	}

	t.Run("does not lock connections when the project has no placements", func(t *testing.T) {
		tx := dalmocks.NewTransaction(t)
		expectOtelPlacementQueries(t, tx, nil, nil)
		tx.On("Delete", mock.AnythingOfType("*models.OtelConnectionProject"), mock.Anything).Return(nil).Once()

		if err := DeleteProjectPlacementsInTransaction(tx, "Core"); err != nil {
			t.Fatalf("DeleteProjectPlacementsInTransaction() error = %v, want nil", err)
		}
		tx.AssertNotCalled(t, "All", mock.AnythingOfType("*[]*models.OtelConnection"), mock.Anything)
	})
}

func TestCheckOtelProjectRemovalChecksEveryConnection(t *testing.T) {
	shared := models.OtelConnection{Model: common.Model{ID: 3}, Status: models.OtelConnectionStatusActive}
	final := models.OtelConnection{Model: common.Model{ID: 9}, Status: models.OtelConnectionStatusActive}
	tx := dalmocks.NewTransaction(t)
	expectOtelPlacementQueries(t, tx,
		[]*models.OtelConnectionProject{{ConnectionId: 9, ProjectName: "Core"}, {ConnectionId: 3, ProjectName: "Core"}},
		map[uint64][]string{3: {"Core", "Mobile"}, 9: {"Core"}},
	)
	expectOtelConnectionLock(t, tx, shared, final)

	err := checkOtelProjectRemoval(tx, "Core")
	if err == nil || err.GetType().GetHttpCode() != http.StatusConflict {
		t.Fatalf("checkOtelProjectRemoval() error = %v, want a conflict for the final placement", err)
	}
}

func TestLockOtelConnections(t *testing.T) {
	t.Run("locks the connections in id order", func(t *testing.T) {
		tx := dalmocks.NewTransaction(t)
		var clauses []dal.Clause
		tx.On("All", mock.AnythingOfType("*[]*models.OtelConnection"), mock.Anything).Run(func(args mock.Arguments) {
			clauses = args.Get(1).([]dal.Clause)
		}).Return(nil).Once()

		input := []uint64{9, 3, 5}
		if _, err := lockOtelConnections(tx, input); err != nil {
			t.Fatalf("lockOtelConnections() error = %v, want nil", err)
		}
		if !hasWriteLock(clauses) {
			t.Fatalf("lockOtelConnections() clauses = %#v, want a write lock", clauses)
		}
		if ids := whereOf(clauses).Params[0].([]uint64); !reflect.DeepEqual(ids, []uint64{3, 5, 9}) {
			t.Fatalf("locked ids = %v, want [3 5 9]", ids)
		}
		if !reflect.DeepEqual(input, []uint64{9, 3, 5}) {
			t.Fatalf("lockOtelConnections() reordered its input to %v", input)
		}
		ordered := false
		for _, clause := range clauses {
			if clause.Type == dal.OrderbyClause && clause.Data.(string) == "id ASC" {
				ordered = true
			}
		}
		if !ordered {
			t.Fatalf("lockOtelConnections() clauses = %#v, want ORDER BY id ASC", clauses)
		}
	})
}

func TestLockOtelConnection(t *testing.T) {
	t.Run("returns the locked connection", func(t *testing.T) {
		tx := dalmocks.NewTransaction(t)
		expectOtelConnectionLock(t, tx, models.OtelConnection{Model: common.Model{ID: 4}, Status: models.OtelConnectionStatusActive})

		connection, err := lockOtelConnection(tx, 4)
		if err != nil || connection.ID != 4 {
			t.Fatalf("lockOtelConnection() = (%v, %v), want connection 4", connection, err)
		}
	})

	t.Run("reports a missing connection as not found", func(t *testing.T) {
		tx := dalmocks.NewTransaction(t)
		expectOtelConnectionLock(t, tx)

		_, err := lockOtelConnection(tx, 4)
		if err == nil || err.GetType().GetHttpCode() != http.StatusNotFound {
			t.Fatalf("lockOtelConnection() error = %v, want not found", err)
		}
	})

	t.Run("rejects a missing id without a query", func(t *testing.T) {
		tx := dalmocks.NewTransaction(t)

		_, err := lockOtelConnection(tx, 0)
		if err == nil || err.GetType().GetHttpCode() != http.StatusBadRequest {
			t.Fatalf("lockOtelConnection() error = %v, want a bad request", err)
		}
	})
}

func TestRenameProjectPlacementsInTransaction(t *testing.T) {
	t.Run("renames only the placements of the old project name", func(t *testing.T) {
		tx := dalmocks.NewTransaction(t)
		expectOtelPlacementQueries(t, tx, []*models.OtelConnectionProject{{ConnectionId: 7, ProjectName: "Core"}}, nil)
		expectOtelConnectionLock(t, tx, models.OtelConnection{Model: common.Model{ID: 7}})
		var column, value string
		var clauses []dal.Clause
		tx.On("UpdateColumn", mock.AnythingOfType("*models.OtelConnectionProject"), mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
			column = args.Get(1).(string)
			value = args.Get(2).(string)
			clauses = args.Get(3).([]dal.Clause)
		}).Return(nil).Once()

		if err := RenameProjectPlacementsInTransaction(tx, "Core", "Platform"); err != nil {
			t.Fatalf("RenameProjectPlacementsInTransaction() error = %v, want nil", err)
		}
		if column != "project_name" || value != "Platform" {
			t.Fatalf("updated column = (%q, %q), want project_name = Platform", column, value)
		}
		where := clauses[0].Data.(dal.DalClause)
		if where.Expr != "project_name = ?" || len(where.Params) != 1 || where.Params[0] != "Core" {
			t.Fatalf("placement rename filter = (%q, %#v), want project_name = ? with Core", where.Expr, where.Params)
		}
	})

	t.Run("returns a failed update", func(t *testing.T) {
		tx := dalmocks.NewTransaction(t)
		expectOtelPlacementQueries(t, tx, nil, nil)
		tx.On("UpdateColumn", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(errors.Default.New("duplicate placement")).Once()

		if err := RenameProjectPlacementsInTransaction(tx, "Core", "Platform"); err == nil {
			t.Fatal("RenameProjectPlacementsInTransaction() error = nil, want an error")
		}
	})
}

func TestLockOtelProjects(t *testing.T) {
	t.Run("reads the named projects with a write lock", func(t *testing.T) {
		tx := dalmocks.NewTransaction(t)
		var clauses []dal.Clause
		tx.On("All", mock.AnythingOfType("*[]*models.Project"), mock.Anything).Run(func(args mock.Arguments) {
			clauses = args.Get(1).([]dal.Clause)
			*args.Get(0).(*[]*coremodels.Project) = []*coremodels.Project{
				{BaseProject: coremodels.BaseProject{Name: "Core"}},
				{BaseProject: coremodels.BaseProject{Name: "Mobile"}},
			}
		}).Return(nil).Once()

		if err := lockOtelProjects(tx, []string{"Core", "Mobile"}); err != nil {
			t.Fatalf("lockOtelProjects() error = %v, want nil", err)
		}
		locked := false
		for _, clause := range clauses {
			if clause.Type == dal.LockClause {
				locked = clause.Data.([]bool)[0]
			}
		}
		if !locked {
			t.Fatalf("lockOtelProjects() clauses = %#v, want a write lock", clauses)
		}
	})

	t.Run("rejects a project that no longer exists", func(t *testing.T) {
		tx := dalmocks.NewTransaction(t)
		tx.On("All", mock.AnythingOfType("*[]*models.Project"), mock.Anything).Run(func(args mock.Arguments) {
			*args.Get(0).(*[]*coremodels.Project) = []*coremodels.Project{{BaseProject: coremodels.BaseProject{Name: "Core"}}}
		}).Return(nil).Once()

		err := lockOtelProjects(tx, []string{"Core", "Gone"})
		if err == nil || err.GetType().GetHttpCode() != http.StatusBadRequest {
			t.Fatalf("lockOtelProjects() error = %v, want a bad request", err)
		}
	})
}
