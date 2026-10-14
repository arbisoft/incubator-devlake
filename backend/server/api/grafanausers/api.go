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
	if defaultService != nil && access.Default() != nil {
		defaultService.audit = access.Default()
	}
	registerRoutesWithAdminCheck(r, defaultService, func(c *gin.Context) (*access.Principal, errors.Error) {
		return access.Default().RequireAdmin(c)
	})
}

func registerRoutesWithAdminCheck(r *gin.Engine, service *Service, check adminCheck) {
	h := &handlers{service: service}
	group := r.Group("/access/grafana", requireCustomerAdmin(check))
	group.GET("/status", h.getStatus)
	group.GET("/users", h.listUsers)
	group.POST("/users", h.createUser)
	group.PATCH("/users/:id", h.patchUser)
	group.PUT("/users/:id/projects", h.setUserProjects)
	group.PUT("/users/:id/password", h.setUserPassword)
	group.DELETE("/users/:id", h.deleteUser)
	group.DELETE("/orphans/:account", h.clearOrphan)
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
	var code string
	var partialUserID int64
	switch data := err.GetData().(type) {
	case string:
		code = data
	case partialData:
		code, partialUserID = ErrCodePartial, data.userID
	}
	message := "unable to process request"
	if status < http.StatusInternalServerError || code != "" {
		if safe := err.Messages().Get(); safe != "" {
			message = strings.TrimSuffix(safe, fmt.Sprintf(" (%d)", status))
		}
	}
	logruslog.Global.Error(err, "HTTP %d grafana users API error", status)
	body := access.ApiErrorResponse{Success: false, Message: message, Code: code}
	if code == ErrCodePartial {
		c.JSON(status, &PartialErrorResponse{ApiErrorResponse: body, UserID: partialUserID})
		return
	}
	c.JSON(status, &body)
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

func userID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id < 1 {
		outputError(c, errors.BadInput.New("id must be a positive integer"))
		return 0, false
	}
	return id, true
}

func bindBody(c *gin.Context, out interface{}) bool {
	if err := c.ShouldBindJSON(out); err != nil {
		outputError(c, errors.BadInput.New("invalid request body"))
		return false
	}
	return true
}

// @Summary Create a Grafana user
// @Description Creates a Grafana account with a password, puts it in the managed org with the role and stores its project access.
// @Tags access
// @Accept json
// @Produce json
// @Param body body CreateUserInput true "New user"
// @Success 201 {object} GrafanaUser
// @Failure 400 {object} access.ApiErrorResponse
// @Failure 401 {object} access.ApiErrorResponse
// @Failure 403 {object} access.ApiErrorResponse
// @Failure 404 {object} access.ApiErrorResponse
// @Failure 409 {object} access.ApiErrorResponse
// @Failure 502 {object} PartialErrorResponse
// @Failure 503 {object} access.ApiErrorResponse
// @Router /access/grafana/users [post]
func (h *handlers) createUser(c *gin.Context) {
	var input CreateUserInput
	if !bindBody(c, &input) {
		return
	}
	user, err := h.service.CreateUser(c.Request.Context(), adminFrom(c), access.ActorLabel(c), input)
	if err != nil {
		outputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, user, http.StatusCreated)
}

// @Summary Update a Grafana user
// @Description Changes the name, email, org role or disabled state of an account.
// @Tags access
// @Accept json
// @Produce json
// @Param id path int true "Grafana user id"
// @Param body body PatchUserInput true "Fields to change"
// @Success 200 {object} GrafanaUser
// @Failure 400 {object} access.ApiErrorResponse
// @Failure 401 {object} access.ApiErrorResponse
// @Failure 403 {object} access.ApiErrorResponse
// @Failure 404 {object} access.ApiErrorResponse
// @Failure 409 {object} access.ApiErrorResponse
// @Failure 503 {object} access.ApiErrorResponse
// @Router /access/grafana/users/{id} [patch]
func (h *handlers) patchUser(c *gin.Context) {
	id, ok := userID(c)
	if !ok {
		return
	}
	var input PatchUserInput
	if !bindBody(c, &input) {
		return
	}
	user, err := h.service.PatchUser(c.Request.Context(), adminFrom(c), access.ActorLabel(c), id, input)
	if err != nil {
		outputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, user, http.StatusOK)
}

// @Summary Set a Grafana user's projects
// @Description Replaces the DevLake projects whose dashboards the account can see.
// @Tags access
// @Accept json
// @Produce json
// @Param id path int true "Grafana user id"
// @Param body body ProjectsInput true "Full project set"
// @Success 200 {object} GrafanaUser
// @Failure 400 {object} access.ApiErrorResponse
// @Failure 401 {object} access.ApiErrorResponse
// @Failure 403 {object} access.ApiErrorResponse
// @Failure 404 {object} access.ApiErrorResponse
// @Failure 503 {object} access.ApiErrorResponse
// @Router /access/grafana/users/{id}/projects [put]
func (h *handlers) setUserProjects(c *gin.Context) {
	id, ok := userID(c)
	if !ok {
		return
	}
	var input ProjectsInput
	if !bindBody(c, &input) {
		return
	}
	user, err := h.service.SetUserProjects(c.Request.Context(), adminFrom(c), access.ActorLabel(c), id, input)
	if err != nil {
		outputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, user, http.StatusOK)
}

// @Summary Set a Grafana user's password
// @Description Sets a new password on an account that is not managed by single sign-on.
// @Tags access
// @Accept json
// @Param id path int true "Grafana user id"
// @Param body body PasswordInput true "New password"
// @Success 204
// @Failure 400 {object} access.ApiErrorResponse
// @Failure 401 {object} access.ApiErrorResponse
// @Failure 403 {object} access.ApiErrorResponse
// @Failure 404 {object} access.ApiErrorResponse
// @Failure 409 {object} access.ApiErrorResponse
// @Failure 503 {object} access.ApiErrorResponse
// @Router /access/grafana/users/{id}/password [put]
func (h *handlers) setUserPassword(c *gin.Context) {
	id, ok := userID(c)
	if !ok {
		return
	}
	var input PasswordInput
	if !bindBody(c, &input) {
		return
	}
	if err := h.service.SetUserPassword(c.Request.Context(), adminFrom(c), access.ActorLabel(c), id, input); err != nil {
		outputError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// @Summary Delete a Grafana user
// @Description Deletes the Grafana account and its project access.
// @Tags access
// @Param id path int true "Grafana user id"
// @Success 204
// @Failure 400 {object} access.ApiErrorResponse
// @Failure 401 {object} access.ApiErrorResponse
// @Failure 403 {object} access.ApiErrorResponse
// @Failure 404 {object} access.ApiErrorResponse
// @Failure 409 {object} access.ApiErrorResponse
// @Failure 503 {object} access.ApiErrorResponse
// @Router /access/grafana/users/{id} [delete]
func (h *handlers) deleteUser(c *gin.Context) {
	id, ok := userID(c)
	if !ok {
		return
	}
	if err := h.service.DeleteUser(c.Request.Context(), adminFrom(c), access.ActorLabel(c), id); err != nil {
		outputError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// @Summary Clear an orphaned project access key
// @Description Removes stored project access for a key that has no Grafana account.
// @Tags access
// @Param account path string true "Stored mapping key"
// @Success 204
// @Failure 400 {object} access.ApiErrorResponse
// @Failure 401 {object} access.ApiErrorResponse
// @Failure 403 {object} access.ApiErrorResponse
// @Failure 404 {object} access.ApiErrorResponse
// @Failure 409 {object} access.ApiErrorResponse
// @Failure 503 {object} access.ApiErrorResponse
// @Router /access/grafana/orphans/{account} [delete]
func (h *handlers) clearOrphan(c *gin.Context) {
	if err := h.service.ClearOrphan(c.Request.Context(), adminFrom(c), access.ActorLabel(c), c.Param("account")); err != nil {
		outputError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
