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
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

func useMockDal(t *testing.T) *dalmocks.Dal {
	dataDal := dalmocks.NewDal(t)
	previous := db
	db = dataDal
	t.Cleanup(func() { db = previous })
	return dataDal
}

func TestGetUserProjectMappingsForLoginsUsesOneInQuery(t *testing.T) {
	dataDal := useMockDal(t)
	var clauses []dal.Clause
	dataDal.On("All", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		clauses = args.Get(1).([]dal.Clause)
		*args.Get(0).(*[]*models.UserProjectMapping) = []*models.UserProjectMapping{
			{UserLogin: "a@x.com", ProjectName: "p1"},
		}
	}).Return(nil).Once()

	got, err := GetUserProjectMappingsForLogins([]string{"a@x.com", "b@x.com"})
	assert.Nil(t, err)
	assert.Len(t, got, 1)
	assert.Len(t, clauses, 2)
	where := clauses[0].Data.(dal.DalClause)
	assert.Equal(t, dal.WhereClause, clauses[0].Type)
	assert.Equal(t, "user_login IN ?", where.Expr)
	assert.Equal(t, []interface{}{[]string{"a@x.com", "b@x.com"}}, where.Params)
	assert.Equal(t, dal.OrderbyClause, clauses[1].Type)
	assert.Equal(t, "user_login, project_name", clauses[1].Data)
}

func TestGetUserProjectMappingsForLoginsEmptyInputSkipsQuery(t *testing.T) {
	useMockDal(t)
	got, err := GetUserProjectMappingsForLogins(nil)
	assert.Nil(t, err)
	assert.NotNil(t, got)
	assert.Empty(t, got)
}

func TestGetUserProjectMappingLoginsReadsDistinctLogins(t *testing.T) {
	dataDal := useMockDal(t)
	var clauses []dal.Clause
	dataDal.On("Pluck", "user_login", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		clauses = args.Get(2).([]dal.Clause)
		*args.Get(1).(*[]string) = []string{"a@x.com", "legacy"}
	}).Return(nil).Once()

	got, err := GetUserProjectMappingLogins()
	assert.Nil(t, err)
	assert.Equal(t, []string{"a@x.com", "legacy"}, got)
	var groupBy bool
	for _, clause := range clauses {
		if clause.Type == dal.GroupbyClause && clause.Data == "user_login" {
			groupBy = true
		}
	}
	assert.True(t, groupBy, "clauses = %#v, want GROUP BY user_login", clauses)
}

func whereOf(c dal.Clause) dal.DalClause { return c.Data.(dal.DalClause) }

func TestReplaceUserProjectMappingsDeletesUnwantedAndInsertsMissing(t *testing.T) {
	dataDal := useMockDal(t)
	tx := dalmocks.NewTransaction(t)
	dataDal.On("Begin").Return(tx).Once()
	var deleteClauses []dal.Clause
	tx.On("Delete", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		deleteClauses = args.Get(1).([]dal.Clause)
	}).Return(nil).Once()
	var created []string
	tx.On("CreateIfNotExist", mock.Anything).Run(func(args mock.Arguments) {
		created = append(created, args.Get(0).(*models.UserProjectMapping).ProjectName)
	}).Return(nil)
	tx.On("Commit").Return(nil).Once()

	assert.Nil(t, ReplaceUserProjectMappings("a@x.com", []string{"p1", "p2"}))
	assert.Equal(t, "user_login = ? AND project_name NOT IN ?", whereOf(deleteClauses[0]).Expr)
	assert.Equal(t, []interface{}{"a@x.com", []string{"p1", "p2"}}, whereOf(deleteClauses[0]).Params)
	assert.Equal(t, []string{"p1", "p2"}, created)
}

func TestReplaceUserProjectMappingsWithEmptySetDeletesAllForLogin(t *testing.T) {
	dataDal := useMockDal(t)
	tx := dalmocks.NewTransaction(t)
	dataDal.On("Begin").Return(tx).Once()
	var deleteClauses []dal.Clause
	tx.On("Delete", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		deleteClauses = args.Get(1).([]dal.Clause)
	}).Return(nil).Once()
	tx.On("Commit").Return(nil).Once()

	assert.Nil(t, ReplaceUserProjectMappings("a@x.com", nil))
	assert.Equal(t, "user_login = ?", whereOf(deleteClauses[0]).Expr)
	assert.Equal(t, []interface{}{"a@x.com"}, whereOf(deleteClauses[0]).Params)
}

func TestReplaceUserProjectMappingsRollsBackOnFailure(t *testing.T) {
	dataDal := useMockDal(t)
	tx := dalmocks.NewTransaction(t)
	dataDal.On("Begin").Return(tx).Once()
	tx.On("Delete", mock.Anything, mock.Anything).Return(nil).Once()
	tx.On("CreateIfNotExist", mock.Anything).Return(errors.Default.New("boom")).Once()
	tx.On("Rollback").Return(nil).Once()

	assert.NotNil(t, ReplaceUserProjectMappings("a@x.com", []string{"p1"}))
}

func TestMoveUserProjectMappingsReplacesNewLoginRowsThenMoves(t *testing.T) {
	dataDal := useMockDal(t)
	tx := dalmocks.NewTransaction(t)
	dataDal.On("Begin").Return(tx).Once()
	var order []string
	tx.On("Count", mock.Anything).Run(func(args mock.Arguments) { order = append(order, "count") }).Return(int64(2), nil).Once()
	var deleteClauses []dal.Clause
	tx.On("Delete", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		order = append(order, "delete")
		deleteClauses = args.Get(1).([]dal.Clause)
	}).Return(nil).Once()
	var updateValue interface{}
	var updateClauses []dal.Clause
	tx.On("UpdateColumn", mock.Anything, "user_login", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		order = append(order, "update")
		updateValue = args.Get(2)
		updateClauses = args.Get(3).([]dal.Clause)
	}).Return(nil).Once()
	tx.On("Commit").Return(nil).Once()

	duringRan := false
	dropped, err := MoveUserProjectMappings("old", "new@x.com", func() errors.Error {
		order = append(order, "during")
		duringRan = true
		return nil
	})
	assert.Nil(t, err)
	assert.True(t, duringRan)
	assert.Equal(t, int64(2), dropped)
	assert.Equal(t, []string{"count", "delete", "update", "during"}, order)
	assert.Equal(t, []interface{}{"new@x.com"}, whereOf(deleteClauses[0]).Params)
	assert.Equal(t, "new@x.com", updateValue)
	assert.Equal(t, []interface{}{"old"}, whereOf(updateClauses[0]).Params)
}

func TestMoveUserProjectMappingsRollsBackWhenDuringFails(t *testing.T) {
	dataDal := useMockDal(t)
	tx := dalmocks.NewTransaction(t)
	dataDal.On("Begin").Return(tx).Once()
	tx.On("Count", mock.Anything).Return(int64(0), nil).Once()
	tx.On("Delete", mock.Anything, mock.Anything).Return(nil).Once()
	tx.On("UpdateColumn", mock.Anything, "user_login", mock.Anything, mock.Anything).Return(nil).Once()
	tx.On("Rollback").Return(nil).Once()

	_, err := MoveUserProjectMappings("old", "new@x.com", func() errors.Error { return errors.Default.New("grafana said no") })
	assert.NotNil(t, err)
}

func TestDeleteUserProjectMappingsForLoginCommitsAndRollsBack(t *testing.T) {
	dataDal := useMockDal(t)
	tx := dalmocks.NewTransaction(t)
	dataDal.On("Begin").Return(tx).Twice()
	var deleteClauses []dal.Clause
	tx.On("Delete", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		deleteClauses = args.Get(1).([]dal.Clause)
	}).Return(nil).Twice()
	tx.On("Commit").Return(nil).Once()
	tx.On("Rollback").Return(nil).Once()

	assert.Nil(t, DeleteUserProjectMappingsForLogin("a@x.com", func() errors.Error { return nil }))
	assert.Equal(t, []interface{}{"a@x.com"}, whereOf(deleteClauses[0]).Params)
	assert.NotNil(t, DeleteUserProjectMappingsForLogin("a@x.com", func() errors.Error { return errors.Default.New("boom") }))
}
