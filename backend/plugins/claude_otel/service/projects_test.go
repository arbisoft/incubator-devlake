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
				if status := err.GetType().GetHttpCode(); status != http.StatusBadRequest {
					t.Fatalf("validateOtelProjectPlacementRemovalState() status = %d, want %d", status, http.StatusBadRequest)
				}
				return
			}
			if err != nil {
				t.Fatalf("validateOtelProjectPlacementRemovalState() error = %v, want nil", err)
			}
		})
	}
}

func TestDeleteProjectPlacementsInTransaction(t *testing.T) {
	hiddenAt := time.Now()
	testCases := []struct {
		name                 string
		connection           models.OtelConnection
		connectionPlacements int
		wantErr              bool
	}{
		{
			name:                 "deletes placements of a shared active connection",
			connection:           models.OtelConnection{Status: models.OtelConnectionStatusActive},
			connectionPlacements: 2,
		},
		{
			name:                 "deletes placements of a revoked and hidden connection",
			connection:           models.OtelConnection{Status: models.OtelConnectionStatusRevoked, HiddenAt: &hiddenAt},
			connectionPlacements: 1,
		},
		{
			name:                 "rejects the final placement of an active connection",
			connection:           models.OtelConnection{Status: models.OtelConnectionStatusActive},
			connectionPlacements: 1,
			wantErr:              true,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			connection := testCase.connection
			connection.Model = common.Model{ID: 7}
			tx := dalmocks.NewTransaction(t)
			tx.On("All", mock.AnythingOfType("*[]*models.OtelConnectionProject"), mock.Anything).Run(func(args mock.Arguments) {
				placements := args.Get(0).(*[]*models.OtelConnectionProject)
				where := args.Get(1).([]dal.Clause)[0].Data.(dal.DalClause)
				switch where.Expr {
				case "project_name = ?":
					*placements = []*models.OtelConnectionProject{{ConnectionId: 7, ProjectName: "Core"}}
				case "connection_id = ?":
					*placements = make([]*models.OtelConnectionProject, testCase.connectionPlacements)
				default:
					t.Fatalf("unexpected placement query %q", where.Expr)
				}
			}).Return(nil)
			tx.On("First", mock.AnythingOfType("*models.OtelConnection"), mock.Anything).Run(func(args mock.Arguments) {
				*args.Get(0).(*models.OtelConnection) = connection
			}).Return(nil).Once()

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
				if status := err.GetType().GetHttpCode(); status != http.StatusBadRequest {
					t.Fatalf("DeleteProjectPlacementsInTransaction() status = %d, want %d", status, http.StatusBadRequest)
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
}
