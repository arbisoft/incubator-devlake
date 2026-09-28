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

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/services"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func TestNewDefaultProjectBlueprintDoesNotSetTimeAfter(t *testing.T) {
	blueprint := newDefaultProjectBlueprint("project-1")

	assert.Equal(t, "project-1-Blueprint", blueprint.Name)
	assert.Equal(t, "project-1", blueprint.ProjectName)
	assert.Nil(t, blueprint.SyncPolicy.TimeAfter)
}

func TestDeleteProjectRemovesOnlyItsUserProjectMappings(t *testing.T) {
	dataDal := dalmocks.NewDal(t)
	blueprintTx := dalmocks.NewTransaction(t)
	projectTx := dalmocks.NewTransaction(t)

	previousDAL, previousBlueprintManager := db, bpManager
	db = dataDal
	bpManager = services.NewBlueprintManager(dataDal)
	t.Cleanup(func() {
		db = previousDAL
		bpManager = previousBlueprintManager
	})

	dataDal.On("First", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		switch record := args.Get(0).(type) {
		case *models.Project:
			record.Name = "project-to-delete"
		case *models.Blueprint:
			record.ID = 7
			record.Name = "project-to-delete-blueprint"
			record.ProjectName = "project-to-delete"
		}
	}).Return(nil)
	dataDal.On("Pluck", mock.Anything, mock.Anything, mock.Anything).Return(nil)
	dataDal.On("All", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		switch records := args.Get(0).(type) {
		case *[]*models.BlueprintConnection:
			*records = nil
		case *[]*models.Pipeline:
			*records = nil
		}
	}).Return(nil)
	dataDal.On("Count", mock.Anything).Return(int64(0), nil)
	dataDal.On("Begin").Return(blueprintTx).Once()
	dataDal.On("Begin").Return(projectTx).Once()

	var mappingDeleteClauses []dal.Clause
	blueprintTx.On("Delete", mock.Anything, mock.Anything).Return(nil)
	blueprintTx.On("Delete", mock.Anything).Return(nil)
	blueprintTx.On("Commit").Return(nil).Once()
	projectTx.On("Delete", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		if _, ok := args.Get(0).(*models.UserProjectMapping); ok {
			mappingDeleteClauses = args.Get(1).([]dal.Clause)
		}
	}).Return(nil)
	projectTx.On("Commit").Return(nil).Once()

	if err := DeleteProject("project-to-delete"); err != nil {
		t.Fatalf("DeleteProject() error = %v", err)
	}

	if len(mappingDeleteClauses) != 1 {
		t.Fatalf("user-project mapping delete clauses = %#v, want one project-name filter", mappingDeleteClauses)
	}
	where, ok := mappingDeleteClauses[0].Data.(dal.DalClause)
	if !ok || mappingDeleteClauses[0].Type != dal.WhereClause {
		t.Fatalf("mapping delete clause = %#v, want WHERE clause", mappingDeleteClauses[0])
	}
	if where.Expr != "project_name = ?" || len(where.Params) != 1 || where.Params[0] != "project-to-delete" {
		t.Fatalf("mapping delete filter = (%q, %#v), want project_name = ? with project-to-delete", where.Expr, where.Params)
	}
}
