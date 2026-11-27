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

package mail

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/server/api/adminonly"
	"github.com/apache/incubator-devlake/server/api/shared"
	"github.com/apache/incubator-devlake/server/services"
	mailsvc "github.com/apache/incubator-devlake/server/services/mail"
)

type fakeMail struct {
	status  mailsvc.Status
	sendErr errors.Error
	req     *mailsvc.SendRequest
}

func (f *fakeMail) Status() mailsvc.Status { return f.status }

func (f *fakeMail) Send(req mailsvc.SendRequest) (*mailsvc.SendResult, errors.Error) {
	f.req = &req
	if f.sendErr != nil {
		return nil, f.sendErr
	}
	return &mailsvc.SendResult{ID: 42, Status: models.EmailStatusQueued, Recipients: 1}, nil
}

type fakeHistory struct {
	query *services.EmailHistoryQuery
	rows  []*models.EmailHistory
	err   errors.Error
	id    uint64
}

func (f *fakeHistory) List(q *services.EmailHistoryQuery) ([]*models.EmailHistory, int64, errors.Error) {
	f.query = q
	return f.rows, int64(len(f.rows)), f.err
}

func (f *fakeHistory) Get(id uint64) (*models.EmailHistory, errors.Error) {
	f.id = id
	if f.err != nil {
		return nil, f.err
	}
	return f.rows[0], nil
}

// caller says who the request comes from, as the auth middleware would set it.
type caller int

const (
	adminSession caller = iota
	sessionWithoutEmail
	apiKey
)

func newRouter(t *testing.T, m mailService, h historyReader, who caller) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	handlers, err := NewHandlers(m, h)
	require.Nil(t, err)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		switch who {
		case adminSession:
			c.Set(common.USER, &common.User{Name: "Admin", Email: "admin@arbisoft.com"})
		case sessionWithoutEmail:
			c.Set(common.USER, &common.User{Name: "admin"})
		case apiKey:
			c.Request = shared.SetRestAuthUser(c.Request, &common.User{Name: "integration-service"})
		}
		c.Next()
	})
	admin := adminonly.Require()
	r.GET("/mail/status", admin, handlers.GetStatus)
	r.POST("/mail/test", admin, handlers.PostTestEmail)
	r.GET("/mail/history", admin, handlers.GetHistory)
	r.GET("/mail/history/:"+EmailIDParam, admin, handlers.GetHistoryEmail)
	return r
}

func do(r *gin.Engine, method, path string) *httptest.ResponseRecorder {
	resp := httptest.NewRecorder()
	r.ServeHTTP(resp, httptest.NewRequest(method, path, nil))
	return resp
}

func decode(t *testing.T, resp *httptest.ResponseRecorder, v interface{}) {
	t.Helper()
	require.NoError(t, json.Unmarshal(resp.Body.Bytes(), v), resp.Body.String())
}

func TestNewHandlersRejectsNil(t *testing.T) {
	_, err := NewHandlers(nil, &fakeHistory{})
	assert.NotNil(t, err)
	_, err = NewHandlers(&fakeMail{}, nil)
	assert.NotNil(t, err)
}

func TestEveryRouteDeniesAPIKeys(t *testing.T) {
	r := newRouter(t, &fakeMail{}, &fakeHistory{}, apiKey)
	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/mail/status"},
		{http.MethodPost, "/mail/test"},
		{http.MethodGet, "/mail/history"},
		{http.MethodGet, "/mail/history/1"},
	} {
		resp := do(r, route.method, route.path)
		assert.Equal(t, http.StatusForbidden, resp.Code, "%s %s", route.method, route.path)
	}
}

func TestGetStatus(t *testing.T) {
	m := &fakeMail{status: mailsvc.Status{
		Enabled: true, Driver: "smtp", Host: "smtp.gmail.com", Port: 587, Security: "starttls", Auth: "plain",
		FromAddress: "devlake-alerts@arbisoft.com", FromName: "DevLake",
	}}

	resp := do(newRouter(t, m, &fakeHistory{}, adminSession), http.MethodGet, "/mail/status")

	require.Equal(t, http.StatusOK, resp.Code)
	assert.JSONEq(t, `{"enabled":true,"driver":"smtp","host":"smtp.gmail.com","port":587,"security":"starttls","auth":"plain",
		"fromAddress":"devlake-alerts@arbisoft.com","fromName":"DevLake"}`, resp.Body.String())
	assert.NotContains(t, resp.Body.String(), "password")
	assert.NotContains(t, resp.Body.String(), "username")
}

func TestPostTestEmailQueuesToTheSignedInUser(t *testing.T) {
	m := &fakeMail{status: mailsvc.Status{Driver: "log"}}

	resp := do(newRouter(t, m, &fakeHistory{}, adminSession), http.MethodPost, "/mail/test")

	require.Equal(t, http.StatusAccepted, resp.Code)
	assert.JSONEq(t, `{"id":42,"status":"QUEUED"}`, resp.Body.String())
	require.NotNil(t, m.req)
	assert.Equal(t, mailsvc.TemplateAlert, m.req.Template)
	assert.Equal(t, []string{"admin@arbisoft.com"}, m.req.Recipients)
	assert.Equal(t, "admin@arbisoft.com", m.req.SentBy)
	assert.Equal(t, "mail_test", m.req.Source)
	assert.IsType(t, mailsvc.AlertData{}, m.req.Data)
}

func TestPostTestEmailErrors(t *testing.T) {
	cases := []struct {
		name    string
		who     caller
		sendErr errors.Error
		status  int
		message string
	}{
		{"no email on the account", sessionWithoutEmail, nil, http.StatusBadRequest, "the signed-in user has no email address"},
		{"mail disabled", adminSession, errors.Conflict.New("mail is disabled"), http.StatusConflict, "mail is disabled"},
		{"outside the allow-list", adminSession, errors.BadInput.New("no valid recipients: 0 invalid, 1 outside the allowed domains"),
			http.StatusBadRequest, "no valid recipients: 0 invalid, 1 outside the allowed domains"},
		{"store failure", adminSession, errors.Default.New("db down"), http.StatusInternalServerError, "an unexpected error occurred"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp := do(newRouter(t, &fakeMail{sendErr: tc.sendErr}, &fakeHistory{}, tc.who), http.MethodPost, "/mail/test")

			assert.Equal(t, tc.status, resp.Code)
			var body shared.ApiBody
			decode(t, resp, &body)
			assert.Equal(t, tc.message, body.Message)
		})
	}
}

func TestGetHistoryListsWithoutContent(t *testing.T) {
	sent := time.Date(2026, 11, 24, 10, 0, 0, 0, time.FixedZone("PKT", 5*3600))
	project := "DevLake"
	h := &fakeHistory{rows: []*models.EmailHistory{{
		ID: 7, Sender: "devlake-alerts@arbisoft.com", Recipients: "a@arbisoft.com,b@arbisoft.com", Subject: "S",
		Content: "<p>secret html</p>", TextContent: "secret text", Status: models.EmailStatusSent, SentOn: &sent,
		SentBy: "system", Template: "alert", ProjectName: &project, Provider: "smtp:smtp.gmail.com", Attempts: 1,
		CreatedAt: sent, UpdatedAt: sent,
	}}}

	resp := do(newRouter(t, &fakeMail{}, h, adminSession), http.MethodGet,
		"/mail/history?page=2&pageSize=10&sortBy=sentOn&sortOrder=asc&status=SENT&template=alert&projectName=DevLake&search=ali&from=2026-11-01T00:00:00Z&to=2026-11-30T00:00:00Z")

	require.Equal(t, http.StatusOK, resp.Code)
	assert.Equal(t, &services.EmailHistoryQuery{
		Pagination: services.Pagination{Page: 2, PageSize: 10},
		SortQuery:  services.SortQuery{SortBy: "sentOn", SortOrder: "asc"},
		Status:     "SENT", Template: "alert", ProjectName: "DevLake", Search: "ali",
		From: "2026-11-01T00:00:00Z", To: "2026-11-30T00:00:00Z",
	}, h.query)
	var page EmailHistoryPage
	decode(t, resp, &page)
	assert.Equal(t, int64(1), page.Count)
	require.Len(t, page.Items, 1)
	assert.Equal(t, []string{"a@arbisoft.com", "b@arbisoft.com"}, page.Items[0].Recipients)
	assert.Equal(t, "DevLake", *page.Items[0].ProjectName)
	assert.Contains(t, resp.Body.String(), `"sentOn":"2026-11-24T05:00:00Z"`, "times are UTC")
	assert.NotContains(t, resp.Body.String(), "secret")
}

func TestGetHistoryErrors(t *testing.T) {
	t.Run("non-numeric page", func(t *testing.T) {
		resp := do(newRouter(t, &fakeMail{}, &fakeHistory{}, adminSession), http.MethodGet, "/mail/history?page=two")
		assert.Equal(t, http.StatusBadRequest, resp.Code)
	})
	t.Run("bad filter from the service", func(t *testing.T) {
		h := &fakeHistory{err: errors.BadInput.New("invalid status: expected QUEUED, SENT or FAILED")}
		resp := do(newRouter(t, &fakeMail{}, h, adminSession), http.MethodGet, "/mail/history?status=BOUNCED")

		assert.Equal(t, http.StatusBadRequest, resp.Code)
		var body shared.ApiBody
		decode(t, resp, &body)
		assert.Equal(t, "invalid status: expected QUEUED, SENT or FAILED", body.Message)
	})
}

func TestGetHistoryEmail(t *testing.T) {
	h := &fakeHistory{rows: []*models.EmailHistory{{ID: 42, Content: "<p>html</p>", TextContent: "text", Status: models.EmailStatusFailed}}}

	resp := do(newRouter(t, &fakeMail{}, h, adminSession), http.MethodGet, "/mail/history/42")

	require.Equal(t, http.StatusOK, resp.Code)
	assert.Equal(t, uint64(42), h.id)
	var detail EmailHistoryDetail
	decode(t, resp, &detail)
	assert.Equal(t, "<p>html</p>", detail.Content)
	assert.Equal(t, "text", detail.TextContent)
	assert.Equal(t, []string{}, detail.Recipients)
}

func TestGetHistoryEmailErrors(t *testing.T) {
	cases := []struct {
		name, path string
		err        errors.Error
		status     int
	}{
		{"not a number", "/mail/history/abc", nil, http.StatusBadRequest},
		{"zero", "/mail/history/0", nil, http.StatusBadRequest},
		{"not found", "/mail/history/5", errors.NotFound.New("email 5 not found"), http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp := do(newRouter(t, &fakeMail{}, &fakeHistory{err: tc.err}, adminSession), http.MethodGet, tc.path)
			assert.Equal(t, tc.status, resp.Code)
		})
	}
}
