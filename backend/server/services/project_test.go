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
	"testing"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/core/plugin"
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
	dataDal.On("Begin").Return(projectTx).Once()

	var mappingDeleteClauses []dal.Clause
	expectProjectRowLock(projectTx)
	projectTx.On("First", mock.AnythingOfType("*models.Blueprint"), mock.Anything).Run(func(args mock.Arguments) {
		args.Get(0).(*models.Blueprint).ID = 7
	}).Return(nil).Once()
	projectTx.On("Delete", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		if _, ok := args.Get(0).(*models.UserProjectMapping); ok {
			mappingDeleteClauses = args.Get(1).([]dal.Clause)
		}
	}).Return(nil)
	projectTx.On("Delete", mock.Anything).Return(nil)
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

func TestPatchProjectRenameMovesOnlyItsUserProjectMappings(t *testing.T) {
	dataDal := dalmocks.NewDal(t)
	projectTx := dalmocks.NewTransaction(t)

	previousDAL, previousBlueprintManager := db, bpManager
	db = dataDal
	bpManager = services.NewBlueprintManager(dataDal)
	t.Cleanup(func() {
		db = previousDAL
		bpManager = previousBlueprintManager
	})

	dataDal.On("Begin").Return(projectTx).Once()
	dataDal.On("All", mock.Anything, mock.Anything).Return(nil)
	dataDal.On("First", mock.Anything, mock.Anything).Return(errors.NotFound.New("no blueprint"))
	dataDal.On("IsErrorNotFound", mock.Anything).Return(true)

	projectTx.On("First", mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		args.Get(0).(*models.Project).Name = "old-name"
	}).Return(nil).Once()

	type update struct {
		column  string
		value   interface{}
		clauses []dal.Clause
	}
	updates := map[string]update{}
	projectTx.On("UpdateColumn", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		updates[fmt.Sprintf("%T", args.Get(0))] = update{column: args.String(1), value: args.Get(2), clauses: args.Get(3).([]dal.Clause)}
	}).Return(nil)
	projectTx.On("Update", mock.Anything).Return(nil)
	projectTx.On("Commit").Return(nil).Once()

	if _, err := PatchProject("old-name", map[string]interface{}{"name": "new-name"}); err != nil {
		t.Fatalf("PatchProject() error = %v", err)
	}

	got, ok := updates[fmt.Sprintf("%T", &models.UserProjectMapping{})]
	if !ok {
		t.Fatalf("no user_project_mapping update issued; updates = %v", updates)
	}
	if got.column != "project_name" || got.value != "new-name" {
		t.Fatalf("mapping update = (%q, %v), want project_name = new-name", got.column, got.value)
	}
	if len(got.clauses) != 1 || got.clauses[0].Type != dal.WhereClause {
		t.Fatalf("mapping update clauses = %#v, want one WHERE clause", got.clauses)
	}
	where, ok := got.clauses[0].Data.(dal.DalClause)
	if !ok || where.Expr != "project_name = ?" || len(where.Params) != 1 || where.Params[0] != "old-name" {
		t.Fatalf("mapping update filter = %#v, want project_name = ? with old-name", got.clauses[0].Data)
	}
}

type testOrdinaryPlugin struct {
	name string
}

func (p *testOrdinaryPlugin) Description() string { return "test ordinary plugin" }
func (p *testOrdinaryPlugin) RootPkgPath() string { return "plugins/test_ordinary" }
func (p *testOrdinaryPlugin) Name() string        { return p.name }

type testHookPlugin struct {
	name        string
	deleteCalls []struct {
		tx          dal.Transaction
		projectName string
	}
	deleteErr   errors.Error
	renameCalls []struct {
		tx      dal.Transaction
		oldName string
		newName string
	}
	renameErr errors.Error
}

func (p *testHookPlugin) Description() string { return "test hook plugin" }
func (p *testHookPlugin) RootPkgPath() string { return "plugins/test_hook" }
func (p *testHookPlugin) Name() string        { return p.name }
func (p *testHookPlugin) BeforeDeleteProject(tx dal.Transaction, projectName string) errors.Error {
	p.deleteCalls = append(p.deleteCalls, struct {
		tx          dal.Transaction
		projectName string
	}{tx: tx, projectName: projectName})
	return p.deleteErr
}

func (p *testHookPlugin) BeforeRenameProject(tx dal.Transaction, oldName string, newName string) errors.Error {
	p.renameCalls = append(p.renameCalls, struct {
		tx      dal.Transaction
		oldName string
		newName string
	}{tx: tx, oldName: oldName, newName: newName})
	return p.renameErr
}

func registerProjectDeleteTestPlugin(t *testing.T, testPlugin plugin.PluginMeta) {
	t.Helper()
	assert.NoError(t, plugin.RegisterPlugin(testPlugin.Name(), testPlugin))
	t.Cleanup(func() {
		delete(plugin.AllPlugins(), testPlugin.Name())
	})
}

func withProjectTestDatabase(t *testing.T, testDB dal.Dal) {
	t.Helper()
	previousDB, previousManager := db, bpManager
	db = testDB
	bpManager = services.NewBlueprintManager(testDB)
	t.Cleanup(func() {
		db = previousDB
		bpManager = previousManager
	})
}

func expectProjectRowLock(tx *dalmocks.Transaction) {
	tx.On("First", mock.AnythingOfType("*models.Project"), mock.MatchedBy(func(clauses []dal.Clause) bool {
		for _, clause := range clauses {
			if clause.Type == dal.LockClause {
				return true
			}
		}
		return false
	})).Return(nil).Once()
}

func TestRunProjectDeleteHooks(t *testing.T) {
	t.Run("skips ordinary plugins without ProjectDeleteHook", func(t *testing.T) {
		ordinary := &testOrdinaryPlugin{name: "test-ordinary-skip"}
		registerProjectDeleteTestPlugin(t, ordinary)

		tx := dalmocks.NewTransaction(t)
		assert.NoError(t, runProjectDeleteHooks(tx, "test-project"))
	})

	t.Run("invokes implementing plugins with exact transaction and project name", func(t *testing.T) {
		hook := &testHookPlugin{name: "test-hook-invoke"}
		registerProjectDeleteTestPlugin(t, hook)

		tx := dalmocks.NewTransaction(t)
		assert.NoError(t, runProjectDeleteHooks(tx, "test-project"))

		assert.Equal(t, 1, len(hook.deleteCalls))
		assert.Equal(t, tx, hook.deleteCalls[0].tx)
		assert.Equal(t, "test-project", hook.deleteCalls[0].projectName)
	})

	t.Run("returns hook veto unwrapped", func(t *testing.T) {
		expectedErr := errors.Default.New("project delete vetoed by plugin")
		hook := &testHookPlugin{
			name:      "test-hook-veto",
			deleteErr: expectedErr,
		}
		registerProjectDeleteTestPlugin(t, hook)

		tx := dalmocks.NewTransaction(t)
		err := runProjectDeleteHooks(tx, "test-project")

		assert.Equal(t, expectedErr, err)
	})
}

func TestDeleteProject_RollsBackOnDeleteHookVeto(t *testing.T) {
	hookErr := errors.Default.New("hook rejection")
	hook := &testHookPlugin{
		name:      "test-hook-rollback-veto",
		deleteErr: hookErr,
	}
	registerProjectDeleteTestPlugin(t, hook)

	tx := dalmocks.NewTransaction(t)
	notFound := errors.NotFound.New("blueprint not found")
	mockDB := dalmocks.NewDal(t)
	mockDB.On("First", mock.Anything, mock.Anything).Return(nil).Once()
	mockDB.On("First", mock.Anything, mock.Anything).Return(notFound).Once()
	mockDB.On("IsErrorNotFound", mock.Anything).Return(true).Twice()
	mockDB.On("Begin").Return(tx).Once()
	expectProjectRowLock(tx)
	tx.On("Rollback").Return(nil).Once()
	withProjectTestDatabase(t, mockDB)

	err := DeleteProject("project-veto")

	assert.Error(t, err)
	assert.ErrorIs(t, err, hookErr)
	assert.Equal(t, 1, len(hook.deleteCalls))
	assert.Equal(t, "project-veto", hook.deleteCalls[0].projectName)
	tx.AssertNotCalled(t, "Commit")
}

func TestDeleteProject_RollsBackOnBlueprintDeletionFailure(t *testing.T) {
	expectedErr := errors.Default.New("unable to delete blueprint labels")
	tx := dalmocks.NewTransaction(t)
	expectProjectRowLock(tx)
	tx.On("First", mock.AnythingOfType("*models.Blueprint"), mock.Anything).Run(func(args mock.Arguments) {
		args.Get(0).(*models.Blueprint).ID = 42
	}).Return(nil).Once()
	tx.On("Delete", mock.Anything, mock.Anything).Return(expectedErr).Once()
	tx.On("Rollback").Return(nil).Once()

	mockDB := dalmocks.NewDal(t)
	mockDB.On("First", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		if blueprint, ok := args.Get(0).(*models.Blueprint); ok {
			blueprint.ID = 42
		}
	}).Return(nil).Twice()
	mockDB.On("Pluck", mock.Anything, mock.Anything, mock.Anything).Return(nil).Once()
	mockDB.On("All", mock.Anything, mock.Anything).Return(nil)
	mockDB.On("Count", mock.Anything).Return(int64(0), nil).Once()
	mockDB.On("Begin").Return(tx).Once()
	withProjectTestDatabase(t, mockDB)

	err := DeleteProject("project-blueprint-failure")

	assert.ErrorIs(t, err, expectedErr)
	tx.AssertNotCalled(t, "Commit")
}

func TestDeleteProject_SuccessfulDeletionInSingleTransaction(t *testing.T) {
	hook := &testHookPlugin{
		name: "test-hook-success",
	}
	registerProjectDeleteTestPlugin(t, hook)

	tx := dalmocks.NewTransaction(t)
	expectProjectRowLock(tx)
	tx.On("First", mock.AnythingOfType("*models.Blueprint"), mock.Anything).Run(func(args mock.Arguments) {
		args.Get(0).(*models.Blueprint).ID = 42
	}).Return(nil).Once()
	tx.On("Delete", mock.Anything, mock.Anything).Return(nil)
	tx.On("Delete", mock.Anything).Return(nil)
	tx.On("Commit").Return(nil).Once()

	mockDB := dalmocks.NewDal(t)
	mockDB.On("First", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		if blueprint, ok := args.Get(0).(*models.Blueprint); ok {
			blueprint.ID = 42
		}
	}).Return(nil).Twice()
	mockDB.On("Pluck", mock.Anything, mock.Anything, mock.Anything).Return(nil).Once()
	mockDB.On("All", mock.Anything, mock.Anything).Return(nil)
	mockDB.On("Count", mock.Anything).Return(int64(0), nil).Once()
	mockDB.On("Begin").Return(tx).Once()
	withProjectTestDatabase(t, mockDB)

	err := DeleteProject("project-success")

	assert.NoError(t, err)
	assert.Equal(t, 1, len(hook.deleteCalls))
	assert.Equal(t, tx, hook.deleteCalls[0].tx)
	assert.Equal(t, "project-success", hook.deleteCalls[0].projectName)
	assert.Len(t, tx.Calls, 13)
	tx.AssertNotCalled(t, "Rollback")
}

func TestRunProjectRenameHooks(t *testing.T) {
	t.Run("skips ordinary plugins without ProjectRenameHook", func(t *testing.T) {
		registerProjectDeleteTestPlugin(t, &testOrdinaryPlugin{name: "test-ordinary-rename-skip"})

		tx := dalmocks.NewTransaction(t)
		assert.NoError(t, runProjectRenameHooks(tx, "old-project", "new-project"))
	})

	t.Run("invokes implementing plugins with exact transaction and names", func(t *testing.T) {
		hook := &testHookPlugin{name: "test-hook-rename-invoke"}
		registerProjectDeleteTestPlugin(t, hook)

		tx := dalmocks.NewTransaction(t)
		assert.NoError(t, runProjectRenameHooks(tx, "old-project", "new-project"))

		assert.Equal(t, 1, len(hook.renameCalls))
		assert.Equal(t, tx, hook.renameCalls[0].tx)
		assert.Equal(t, "old-project", hook.renameCalls[0].oldName)
		assert.Equal(t, "new-project", hook.renameCalls[0].newName)
	})

	t.Run("returns hook veto unwrapped", func(t *testing.T) {
		expectedErr := errors.Default.New("project rename vetoed by plugin")
		registerProjectDeleteTestPlugin(t, &testHookPlugin{name: "test-hook-rename-veto", renameErr: expectedErr})

		tx := dalmocks.NewTransaction(t)
		err := runProjectRenameHooks(tx, "old-project", "new-project")

		assert.Equal(t, expectedErr, err)
	})
}

func TestPatchProject_RunsRenameHookBeforeRenamingProjectRow(t *testing.T) {
	hook := &testHookPlugin{name: "test-hook-patch-rename"}
	registerProjectDeleteTestPlugin(t, hook)

	var renamed []string
	tx := dalmocks.NewTransaction(t)
	expectProjectRowLock(tx)
	tx.On("UpdateColumn", mock.Anything, mock.Anything, mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		assert.Equal(t, 1, len(hook.renameCalls), "rename hook must run before any core table is renamed")
		if _, ok := args.Get(0).(*models.Project); ok {
			renamed = append(renamed, args.Get(2).(string))
		}
	}).Return(nil)
	tx.On("Update", mock.Anything).Return(nil)
	tx.On("Commit").Return(nil).Once()
	mockDB := dalmocks.NewDal(t)
	mockDB.On("Begin").Return(tx).Once()
	mockDB.On("Pluck", mock.Anything, mock.Anything, mock.Anything).Return(nil)
	mockDB.On("All", mock.Anything, mock.Anything).Return(nil)
	mockDB.On("First", mock.Anything, mock.Anything).Return(nil)
	withProjectTestDatabase(t, mockDB)

	_, err := PatchProject("old-project", map[string]interface{}{"name": "new-project"})

	assert.NoError(t, err)
	assert.Equal(t, []string{"new-project"}, renamed)
	assert.Equal(t, "old-project", hook.renameCalls[0].oldName)
	assert.Equal(t, "new-project", hook.renameCalls[0].newName)
}

func TestPatchProject_SkipsRenameHookWhenNameIsUnchanged(t *testing.T) {
	hook := &testHookPlugin{name: "test-hook-patch-same-name"}
	registerProjectDeleteTestPlugin(t, hook)

	tx := dalmocks.NewTransaction(t)
	expectProjectRowLock(tx)
	tx.On("Update", mock.Anything).Return(nil)
	tx.On("Commit").Return(nil).Once()
	mockDB := dalmocks.NewDal(t)
	mockDB.On("Begin").Return(tx).Once()
	mockDB.On("Pluck", mock.Anything, mock.Anything, mock.Anything).Return(nil)
	mockDB.On("All", mock.Anything, mock.Anything).Return(nil)
	mockDB.On("First", mock.Anything, mock.Anything).Return(nil)
	withProjectTestDatabase(t, mockDB)

	_, err := PatchProject("same-project", map[string]interface{}{"name": "same-project"})

	assert.NoError(t, err)
	assert.Empty(t, hook.renameCalls)
}

func TestPatchProject_RollsBackOnRenameHookVeto(t *testing.T) {
	hookErr := errors.Default.New("hook rejection")
	registerProjectDeleteTestPlugin(t, &testHookPlugin{name: "test-hook-patch-veto", renameErr: hookErr})

	tx := dalmocks.NewTransaction(t)
	expectProjectRowLock(tx)
	tx.On("Rollback").Return(nil).Once()
	mockDB := dalmocks.NewDal(t)
	mockDB.On("Begin").Return(tx).Once()
	withProjectTestDatabase(t, mockDB)

	_, err := PatchProject("old-project", map[string]interface{}{"name": "new-project"})

	assert.ErrorIs(t, err, hookErr)
	tx.AssertNotCalled(t, "Commit")
	for _, call := range tx.Calls {
		assert.NotEqual(t, "UpdateColumn", call.Method, "no table may be renamed after a hook veto")
	}
}
