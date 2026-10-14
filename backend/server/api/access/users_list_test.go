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

package access

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"

	"github.com/apache/incubator-devlake/core/dal"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
)

func TestListUsersKeyword(t *testing.T) {
	const keywordWhere = "(LOWER(email) LIKE ? OR LOWER(display_name) LIKE ?)"
	testCases := []struct {
		name       string
		keyword    string
		wantParams []interface{}
	}{
		{name: "no keyword keeps the hidden filter only"},
		{name: "keyword is lowercased", keyword: "Ada.LOVELACE", wantParams: []interface{}{"%ada.lovelace%", "%ada.lovelace%"}},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			var countClauses, listClauses []dal.Clause
			testDal := dalmocks.NewDal(t)
			testDal.On("Count", mock.Anything).Run(func(args mock.Arguments) {
				countClauses = args.Get(0).([]dal.Clause)
			}).Return(int64(0), nil)
			testDal.On("All", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
				listClauses = args.Get(1).([]dal.Clause)
			}).Return(nil)
			service := &Service{db: testDal}

			_, err := service.ListUsers(UserListQuery{Keyword: tc.keyword})
			assert.Nil(t, err)

			for _, clauses := range [][]dal.Clause{countClauses, listClauses} {
				wheres := make([]dal.DalClause, 0)
				for _, clause := range clauses {
					if clause.Type == dal.WhereClause {
						wheres = append(wheres, clause.Data.(dal.DalClause))
					}
				}
				assert.Equal(t, "hidden_at IS NULL", wheres[0].Expr)
				if tc.wantParams == nil {
					assert.Len(t, wheres, 1)
					continue
				}
				if assert.Len(t, wheres, 2) {
					assert.Equal(t, keywordWhere, wheres[1].Expr)
					assert.Equal(t, tc.wantParams, wheres[1].Params)
				}
			}
			var order string
			for _, clause := range listClauses {
				if clause.Type == dal.OrderbyClause {
					order = clause.Data.(string)
				}
			}
			assert.Equal(t, "email ASC", order)
		})
	}
}

func TestListUsersRejectsUnsupportedPageSize(t *testing.T) {
	service := &Service{db: dalmocks.NewDal(t)}
	_, err := service.ListUsers(UserListQuery{PageQuery: PageQuery{PageSize: 7}, Keyword: "ada"})
	if assert.NotNil(t, err) {
		assert.Equal(t, http.StatusBadRequest, err.GetType().GetHttpCode())
	}
}

func TestUserListQueryBindsKeywordAndPaging(t *testing.T) {
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodGet, "/access/users?page=2&pageSize=25&keyword=Ada", nil)
	query, ok := userListQuery(context)
	assert.True(t, ok)
	assert.Equal(t, UserListQuery{PageQuery: PageQuery{Page: 2, PageSize: 25}, Keyword: "Ada"}, query)
}
