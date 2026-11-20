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

package blueprints

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"

	"github.com/apache/incubator-devlake/server/services"
)

func TestBlueprintQueryBindsRepeatedParams(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodGet,
		"/blueprints?connection=github:1&connection=gitlab:2&projectName=a&projectName=b&type=DAILY&type=MANUAL", nil)
	var query services.BlueprintQuery
	assert.NoError(t, c.ShouldBindQuery(&query))
	assert.Equal(t, []string{"github:1", "gitlab:2"}, query.Connection)
	assert.Equal(t, []string{"a", "b"}, query.ProjectName)
	assert.Equal(t, []string{"DAILY", "MANUAL"}, query.Type)
}
