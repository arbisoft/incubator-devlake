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

	"github.com/apache/incubator-devlake/core/dal"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/mock"
)

func TestRemoveLocalCredentialRejectsFinalInteractiveMethod(t *testing.T) {
	db := dalmocks.NewDal(t)
	tx := dalmocks.NewTransaction(t)
	db.EXPECT().Begin().Return(tx)
	tx.EXPECT().All(mock.Anything, mock.Anything).Return(nil)
	tx.EXPECT().First(mock.Anything, mock.Anything).Run(func(destination interface{}, _ ...dal.Clause) {
		switch value := destination.(type) {
		case *AccessUser:
			value.ID = 42
			value.Status = StatusActive
		case *LocalCredential:
			value.AccessUserID = 42
			value.LoginName = "admin"
		}
	}).Return(nil).Twice()
	tx.EXPECT().Count(mock.Anything).Return(int64(1), nil)
	tx.EXPECT().Rollback().Return(nil)

	_, err := (&Service{db: db}).RemoveLocalCredential("admin", 42)
	if err == nil || err.GetData() != ErrCodeLastLoginMethod {
		t.Fatalf("RemoveLocalCredential() error = %v, want last-login-method rejection", err)
	}
}

func TestOutputLocalCredentialDisablesResponseCaching(t *testing.T) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)

	outputLocalCredential(context, &LocalCredentialResponse{TemporaryPassword: "temporary-password"}, http.StatusCreated)

	if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
}
