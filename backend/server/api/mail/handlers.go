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

// Package mail serves the admin-only mail status, test email and email history endpoints.
package mail

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/server/api/shared"
	"github.com/apache/incubator-devlake/server/services"
	mailsvc "github.com/apache/incubator-devlake/server/services/mail"
)

// EmailIDParam is the path parameter of GET /mail/history/:emailId.
const EmailIDParam = "emailId"

// testEmailSource marks test emails in the history table.
const testEmailSource = "mail_test"

// mailService is what the handlers need from mail.Service.
type mailService interface {
	Status() mailsvc.Status
	Send(req mailsvc.SendRequest) (*mailsvc.SendResult, errors.Error)
}

// historyReader is what the handlers need from services.MailHistoryService.
type historyReader interface {
	List(q *services.EmailHistoryQuery) ([]*models.EmailHistory, int64, errors.Error)
	Get(id uint64) (*models.EmailHistory, errors.Error)
}

var (
	_ mailService   = (*mailsvc.Service)(nil)
	_ historyReader = (*services.MailHistoryService)(nil)
)

// Handlers serves the /mail endpoints. Every route is registered behind adminonly.Require().
type Handlers struct {
	mail    mailService
	history historyReader
}

// NewHandlers returns the handlers. Neither dependency may be nil.
func NewHandlers(mail mailService, history historyReader) (*Handlers, errors.Error) {
	if mail == nil || history == nil {
		return nil, errors.Default.New("mail handlers: nil dependency")
	}
	return &Handlers{mail: mail, history: history}, nil
}

// GetStatus returns the mail setup.
// @Summary Get the mail setup
// @Description Whether mail is on, the driver, SMTP host, port, security and auth type, and the from address. Never returns the SMTP username or password. Admin only.
// @Tags framework/mail
// @Produce json
// @Success 200 {object} MailStatus
// @Failure 403 {object} shared.ApiBody "Administrator role required"
// @Router /mail/status [get]
func (h *Handlers) GetStatus(c *gin.Context) {
	shared.ApiOutputSuccess(c, toMailStatus(h.mail.Status()), http.StatusOK)
}

// PostTestEmail queues a test email to the signed-in admin.
// @Summary Send a test email
// @Description Queues a test email to the signed-in user's address through the normal send flow and records it in the history with sent_by set to that user. The email is sent in the background; poll GET /mail/history/{emailId} for the result. Admin only.
// @Tags framework/mail
// @Produce json
// @Success 202 {object} TestEmailResponse
// @Failure 400 {object} shared.ApiBody "The signed-in user has no valid email address, or it is outside MAIL_ALLOWED_RECIPIENT_DOMAINS"
// @Failure 403 {object} shared.ApiBody "Administrator role required"
// @Failure 409 {object} shared.ApiBody "Mail is disabled"
// @Failure 500 {object} shared.ApiBody "Internal Error"
// @Router /mail/test [post]
func (h *Handlers) PostTestEmail(c *gin.Context) {
	user, ok := shared.GetUser(c)
	if !ok || user == nil || strings.TrimSpace(user.Email) == "" {
		shared.ApiOutputError(c, errors.BadInput.New("the signed-in user has no email address"))
		return
	}
	status := h.mail.Status()
	result, err := h.mail.Send(mailsvc.SendRequest{
		Template: mailsvc.TemplateAlert,
		Data: mailsvc.AlertData{
			Title:   "Test email",
			Summary: "This is a test email from DevLake. If you can read it, mail is set up correctly.",
			Details: []mailsvc.Detail{
				{Label: "Requested by", Value: user.Email},
				{Label: "Driver", Value: status.Driver},
			},
		},
		Recipients: []string{user.Email},
		Source:     testEmailSource,
		SentBy:     user.Email,
	})
	if err != nil {
		shared.ApiOutputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, TestEmailResponse{ID: result.ID, Status: result.Status}, http.StatusAccepted)
}

// GetHistory lists sent emails without their content.
// @Summary List email history
// @Description One page of the emails DevLake sent or tried to send, without content. Newest first by default. Admin only.
// @Tags framework/mail
// @Produce json
// @Param page query int false "Page number, from 1" default(1)
// @Param pageSize query int false "Rows per page, at most 100" default(50)
// @Param sortBy query string false "Sort column, defaults to createdAt" Enums(createdAt, sentOn, status, template, subject)
// @Param sortOrder query string false "Sort direction, defaults to desc" Enums(asc, desc)
// @Param status query string false "Only this status" Enums(QUEUED, SENT, FAILED)
// @Param template query string false "Only this template" example(alert)
// @Param projectName query string false "Only this project"
// @Param search query string false "Case-insensitive match on recipients or subject"
// @Param from query string false "Created at or after, RFC 3339" example(2026-11-01T00:00:00Z)
// @Param to query string false "Created at or before, RFC 3339" example(2026-11-30T23:59:59Z)
// @Success 200 {object} EmailHistoryPage
// @Failure 400 {object} shared.ApiBody "Invalid filter, sort or page value"
// @Failure 403 {object} shared.ApiBody "Administrator role required"
// @Failure 500 {object} shared.ApiBody "Internal Error"
// @Router /mail/history [get]
func (h *Handlers) GetHistory(c *gin.Context) {
	var query services.EmailHistoryQuery
	if err := c.ShouldBindQuery(&query); err != nil {
		shared.ApiOutputError(c, errors.BadInput.Wrap(err, "invalid query: page and pageSize must be numbers"))
		return
	}
	rows, count, err := h.history.List(&query)
	if err != nil {
		shared.ApiOutputError(c, err)
		return
	}
	items := make([]EmailHistoryItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, toItem(row))
	}
	shared.ApiOutputSuccess(c, EmailHistoryPage{Items: items, Count: count}, http.StatusOK)
}

// GetHistoryEmail returns one email with its content.
// @Summary Get one email
// @Description One email from the history, with its rendered HTML and plain text. Admin only.
// @Tags framework/mail
// @Produce json
// @Param emailId path int true "Email history id" example(42)
// @Success 200 {object} EmailHistoryDetail
// @Failure 400 {object} shared.ApiBody "emailId is not a positive number"
// @Failure 403 {object} shared.ApiBody "Administrator role required"
// @Failure 404 {object} shared.ApiBody "No email with this id"
// @Failure 500 {object} shared.ApiBody "Internal Error"
// @Router /mail/history/{emailId} [get]
func (h *Handlers) GetHistoryEmail(c *gin.Context) {
	id, parseErr := strconv.ParseUint(c.Param(EmailIDParam), 10, 64)
	if parseErr != nil || id == 0 {
		shared.ApiOutputError(c, errors.BadInput.New("emailId must be a positive number"))
		return
	}
	row, err := h.history.Get(id)
	if err != nil {
		shared.ApiOutputError(c, err)
		return
	}
	shared.ApiOutputSuccess(c, EmailHistoryDetail{
		EmailHistoryItem: toItem(row),
		Content:          row.Content,
		TextContent:      row.TextContent,
	}, http.StatusOK)
}
