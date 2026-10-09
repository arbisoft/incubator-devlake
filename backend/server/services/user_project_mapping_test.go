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
