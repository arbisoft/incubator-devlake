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

package compliancescorecard

import (
	"net/http"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/server/api/shared"
	"github.com/apache/incubator-devlake/server/services"
	"github.com/gin-gonic/gin"
)

// @Summary Get compliance scorecard
// @Description Get the compliance scorecard rows from the database
// @Tags framework/compliance-scorecard
// @Accept application/json
// @Success 200  {object} gin.H "{"rows": rows, "count": count}"
// @Failure 400  {string} errcode.Error "Bad Request"
// @Failure 500  {string} errcode.Error "Internal Error"
// @Router /compliance-scorecard [get]
func Get(c *gin.Context) {
	rows, err := services.GetComplianceScorecard()
	if err != nil {
		shared.ApiOutputError(c, errors.Default.Wrap(err, "error getting compliance scorecard"))
		return
	}
	shared.ApiOutputSuccess(c, gin.H{"rows": rows, "count": len(rows)}, http.StatusOK)
}
