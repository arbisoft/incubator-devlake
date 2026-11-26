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

package integration

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/server/api/integration/services"
	"github.com/apache/incubator-devlake/server/api/shared"
)

// maxOnboardingBody caps the request body. The largest valid body is three 255-character fields.
const maxOnboardingBody = 16 << 10

// projectAccessGranter is what the handlers need from services.ProjectAccess.
type projectAccessGranter interface {
	Map(projectName, email, name string) (*services.ProjectUserMapping, errors.Error)
}

// inviteQueuer is what the handlers need from services.InviteSender.
type inviteQueuer interface {
	Send(projectName, email, sentBy string) (*services.InviteEmail, errors.Error)
}

var (
	_ projectAccessGranter = (*services.ProjectAccess)(nil)
	_ inviteQueuer         = (*services.InviteSender)(nil)
)

// MapProjectUserRequest is the body of POST /integration/map-project-user.
type MapProjectUserRequest struct {
	ProjectName string `json:"projectName" example:"Payments"`
	Email       string `json:"email" example:"lead@arbisoft.com"`
	// Name is the user's full name from the ERP. It replaces the stored name when they differ.
	Name string `json:"name" example:"Ali Khan"`
}

// SendInviteEmailRequest is the body of POST /integration/send-invite-email.
type SendInviteEmailRequest struct {
	ProjectName string `json:"projectName" example:"Payments"`
	Email       string `json:"email" example:"lead@arbisoft.com"`
}

// OnboardingHandlers serves the endpoints the Integration Service calls to give a user a new project.
type OnboardingHandlers struct {
	access  projectAccessGranter
	invites inviteQueuer
}

// NewOnboardingHandlers returns the handlers. Neither dependency may be nil.
func NewOnboardingHandlers(access projectAccessGranter, invites inviteQueuer) (*OnboardingHandlers, errors.Error) {
	if access == nil || invites == nil {
		return nil, errors.Default.New("onboarding handlers: nil dependency")
	}
	return &OnboardingHandlers{access: access, invites: invites}, nil
}

// PostMapProjectUser gives a user access to a project.
// @Summary Give a user access to a project
// @Description Creates the user in DevLake's users table, or updates their name when it differs, and gives them access to the project, in one transaction. Calling it again is safe: the flags say what changed. Any email domain is accepted. Only a DevLake API key can call it: call /rest/integration/map-project-user.
// @Tags framework/integration
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body MapProjectUserRequest true "The project, the user's email and full name"
// @Success 201 {object} services.ProjectUserMapping
// @Failure 400 {object} shared.ApiBody "Missing or invalid projectName, email or name"
// @Failure 401 {object} shared.ApiBody "Not called with a DevLake API key"
// @Failure 403 {object} shared.ApiBody "API key invalid or out of scope"
// @Failure 404 {object} shared.ApiBody "Project not found"
// @Failure 500 {object} shared.ApiBody "Internal Error"
// @Router /integration/map-project-user [post]
func (h *OnboardingHandlers) PostMapProjectUser(c *gin.Context) {
	var req MapProjectUserRequest
	if !bindBody(c, &req) {
		return
	}
	result, err := h.access.Map(req.ProjectName, req.Email, req.Name)
	if err != nil {
		shared.ApiOutputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, result, http.StatusCreated)
}

// PostSendInviteEmail queues a project invite email.
// @Summary Send a project invite email
// @Description Queues an email telling the user their project is ready, with its compliance scorecard: ticketing, version control and AI usage visibility. The user must have access to the project and a users row from map-project-user; the email uses the name stored there. Every call queues a new email, sent in the background and recorded in the email history. Only a DevLake API key can call it: call /rest/integration/send-invite-email.
// @Tags framework/integration
// @Accept json
// @Produce json
// @Security ApiKeyAuth
// @Param body body SendInviteEmailRequest true "The project and the user's email"
// @Success 202 {object} services.InviteEmail
// @Failure 400 {object} shared.ApiBody "Missing or invalid projectName or email, or the email is outside MAIL_ALLOWED_RECIPIENT_DOMAINS"
// @Failure 401 {object} shared.ApiBody "Not called with a DevLake API key"
// @Failure 403 {object} shared.ApiBody "API key invalid or out of scope"
// @Failure 404 {object} shared.ApiBody "Project, project access or user not found"
// @Failure 409 {object} shared.ApiBody "Mail is disabled"
// @Failure 500 {object} shared.ApiBody "Internal Error"
// @Router /integration/send-invite-email [post]
func (h *OnboardingHandlers) PostSendInviteEmail(c *gin.Context) {
	var req SendInviteEmailRequest
	if !bindBody(c, &req) {
		return
	}
	result, err := h.invites.Send(req.ProjectName, req.Email, callerName(c))
	if err != nil {
		shared.ApiOutputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, result, http.StatusAccepted)
}

// bindBody decodes the JSON body into dst, capped at maxOnboardingBody. It writes a 400 and returns false when the
// body is not valid JSON for dst. The services check the fields.
func bindBody(c *gin.Context, dst interface{}) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxOnboardingBody)
	if err := c.ShouldBindJSON(dst); err != nil {
		shared.ApiOutputError(c, errors.BadInput.Wrap(err, shared.BadRequestBody))
		return false
	}
	return true
}

// callerName is who to record as the sender: the API key's creator, or empty for the system.
func callerName(c *gin.Context) string {
	user, ok := shared.GetRestAuthUser(c.Request)
	if !ok {
		return ""
	}
	if name := strings.TrimSpace(user.Name); name != "" {
		return name
	}
	return strings.TrimSpace(user.Email)
}
