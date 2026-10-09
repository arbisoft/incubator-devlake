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

package grafanausers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/impls/logruslog"
	"github.com/apache/incubator-devlake/server/api/access"
	"github.com/apache/incubator-devlake/server/api/shared"
)

const adminContextKey = "grafanausers.admin"

// adminCheck resolves the calling customer administrator or the error to answer with.
type adminCheck func(c *gin.Context) (*access.Principal, errors.Error)

type handlers struct {
	service *Service
}

// RegisterRoutes registers the Grafana user management routes behind the customer-admin check.
func RegisterRoutes(r *gin.Engine) {
	registerRoutesWithAdminCheck(r, defaultService, func(c *gin.Context) (*access.Principal, errors.Error) {
		return access.Default().RequireAdmin(c)
	})
}

func registerRoutesWithAdminCheck(r *gin.Engine, service *Service, check adminCheck) {
	h := &handlers{service: service}
	group := r.Group("/access/grafana", requireCustomerAdmin(check))
	group.GET("/status", h.getStatus)
	group.GET("/users", h.listUsers)
}

func requireCustomerAdmin(check adminCheck) gin.HandlerFunc {
	return func(c *gin.Context) {
		principal, err := check(c)
		if err != nil {
			outputError(c, err)
			c.Abort()
			return
		}
		c.Set(adminContextKey, principal)
		c.Next()
	}
}

func adminFrom(c *gin.Context) *access.Principal {
	value, _ := c.Get(adminContextKey)
	principal, _ := value.(*access.Principal)
	return principal
}

// outputError answers with the access API error shape; only 4xx and coded errors expose their message.
func outputError(c *gin.Context, err errors.Error) {
	status := err.GetType().GetHttpCode()
	code, _ := err.GetData().(string)
	message := "unable to process request"
	if status < http.StatusInternalServerError || code != "" {
		if safe := err.Messages().Get(); safe != "" {
			message = strings.TrimSuffix(safe, fmt.Sprintf(" (%d)", status))
		}
	}
	logruslog.Global.Error(err, "HTTP %d grafana users API error", status)
	c.JSON(status, &access.ApiErrorResponse{Success: false, Message: message, Code: code})
}

// @Summary Grafana user management availability
// @Description Reports whether the Grafana management identity can administer users.
// @Tags access
// @Produce json
// @Success 200 {object} StatusResponse
// @Failure 401 {object} access.ApiErrorResponse
// @Failure 403 {object} access.ApiErrorResponse
// @Failure 404 {object} access.ApiErrorResponse
// @Router /access/grafana/status [get]
func (h *handlers) getStatus(c *gin.Context) {
	status, err := h.service.Status(c.Request.Context(), adminFrom(c))
	if err != nil {
		outputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, status, http.StatusOK)
}

// @Summary List Grafana users
// @Description Lists Grafana org users with their dashboard project access and mapping keys that have no account.
// @Tags access
// @Produce json
// @Param query query string false "Search text"
// @Param page query int false "Page number, from 1" default(1)
// @Param pageSize query int false "Page size, 1 to 100" default(20)
// @Success 200 {object} ListResponse
// @Failure 400 {object} access.ApiErrorResponse
// @Failure 401 {object} access.ApiErrorResponse
// @Failure 403 {object} access.ApiErrorResponse
// @Failure 404 {object} access.ApiErrorResponse
// @Failure 503 {object} access.ApiErrorResponse
// @Router /access/grafana/users [get]
func (h *handlers) listUsers(c *gin.Context) {
	page, ok := intQuery(c, "page", defaultPage)
	if !ok {
		return
	}
	pageSize, ok := intQuery(c, "pageSize", defaultPageSize)
	if !ok {
		return
	}
	result, err := h.service.ListUsers(c.Request.Context(), adminFrom(c), ListQuery{Query: c.Query("query"), Page: page, PageSize: pageSize})
	if err != nil {
		outputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, result, http.StatusOK)
}

func intQuery(c *gin.Context, name string, fallback int) (int, bool) {
	raw, present := c.GetQuery(name)
	if !present {
		return fallback, true
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		outputError(c, errors.BadInput.New(name+" must be a number"))
		return 0, false
	}
	return value, true
}
