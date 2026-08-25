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
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/server/api/shared"
)

type currentResponse struct {
	Enabled bool   `json:"enabled"`
	Role    string `json:"role,omitempty"`
}

func GetCurrent(c *gin.Context) {
	service := Default()
	if service == nil || !service.Enabled() {
		shared.ApiOutputSuccess(c, currentResponse{Enabled: false}, http.StatusOK)
		return
	}
	principal, err := service.CurrentPrincipal(c)
	if err != nil {
		shared.ApiOutputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, currentResponse{Enabled: true, Role: principal.Role}, http.StatusOK)
}

func ListUsers(c *gin.Context) {
	if _, ok := requireAdmin(c); !ok {
		return
	}
	query, ok := listQuery(c)
	if !ok {
		return
	}
	users, err := Default().ListUsers(query)
	if err != nil {
		shared.ApiOutputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, users, http.StatusOK)
}

func PostUser(c *gin.Context) {
	if _, ok := requireAdmin(c); !ok {
		return
	}
	input := CreateUserInput{}
	if err := c.ShouldBindJSON(&input); err != nil {
		shared.ApiOutputError(c, errors.BadInput.Wrap(err, "invalid access user"))
		return
	}
	actor, _ := GetIdentity(c)
	user, err := Default().CreateUser(actor.Email, input.Email, input.Role)
	if err != nil {
		shared.ApiOutputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, user, http.StatusCreated)
}

func ListDomains(c *gin.Context) {
	if _, ok := requireAdmin(c); !ok {
		return
	}
	query, ok := listQuery(c)
	if !ok {
		return
	}
	domains, err := Default().ListDomains(query)
	if err != nil {
		shared.ApiOutputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, domains, http.StatusOK)
}

func ListAuditEvents(c *gin.Context) {
	if _, ok := requireAdmin(c); !ok {
		return
	}
	events, err := Default().ListAuditEvents()
	if err != nil {
		shared.ApiOutputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, events, http.StatusOK)
}

func PostDomain(c *gin.Context) {
	if _, ok := requireAdmin(c); !ok {
		return
	}
	input := CreateDomainInput{}
	if err := c.ShouldBindJSON(&input); err != nil {
		shared.ApiOutputError(c, errors.BadInput.Wrap(err, "invalid access domain"))
		return
	}
	actor, _ := GetIdentity(c)
	domain, err := Default().CreateDomain(actor.Email, AccessDomain{Domain: input.Domain, DefaultRole: input.DefaultRole})
	if err != nil {
		shared.ApiOutputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, domain, http.StatusCreated)
}

func PatchDomain(c *gin.Context) {
	if _, ok := requireAdmin(c); !ok {
		return
	}
	id, parseErr := strconv.ParseUint(c.Param("id"), 10, 64)
	if parseErr != nil || id == 0 {
		shared.ApiOutputError(c, errors.BadInput.New("invalid access domain id"))
		return
	}
	input := UpdateDomainInput{}
	if err := c.ShouldBindJSON(&input); err != nil {
		shared.ApiOutputError(c, errors.BadInput.Wrap(err, "invalid access domain update"))
		return
	}
	actor, _ := GetIdentity(c)
	domain, err := Default().UpdateDomain(actor.Email, id, input.DefaultRole, input.Status)
	if err != nil {
		shared.ApiOutputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, domain, http.StatusOK)
}

func PatchUser(c *gin.Context) {
	if _, ok := requireAdmin(c); !ok {
		return
	}
	id, parseErr := strconv.ParseUint(c.Param("id"), 10, 64)
	if parseErr != nil || id == 0 {
		shared.ApiOutputError(c, errors.BadInput.New("invalid access user id"))
		return
	}
	input := UpdateUserInput{}
	if err := c.ShouldBindJSON(&input); err != nil {
		shared.ApiOutputError(c, errors.BadInput.Wrap(err, "invalid access user update"))
		return
	}
	actor, _ := GetIdentity(c)
	user, err := Default().UpdateUser(actor.Email, id, input.Role, input.Status)
	if err != nil {
		shared.ApiOutputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, user, http.StatusOK)
}

func requireAdmin(c *gin.Context) (*Principal, bool) {
	principal, err := Default().RequireAdmin(c)
	if err != nil {
		shared.ApiOutputError(c, err)
		return nil, false
	}
	return principal, true
}

func listQuery(c *gin.Context) (PageQuery, bool) {
	query := PageQuery{}
	if err := c.ShouldBindQuery(&query); err != nil {
		shared.ApiOutputError(c, errors.BadInput.Wrap(err, "invalid access list query"))
		return PageQuery{}, false
	}
	query, valid := query.Normalize()
	if !valid {
		shared.ApiOutputError(c, errors.BadInput.New(invalidPageSizeMessage))
		return PageQuery{}, false
	}
	return query, true
}
