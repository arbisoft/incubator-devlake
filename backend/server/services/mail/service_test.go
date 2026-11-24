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
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
)

var fixedNow = time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)

type fakeHistory struct {
	rows []*models.EmailHistory
	err  errors.Error
}

func (f *fakeHistory) Create(row *models.EmailHistory) errors.Error {
	if f.err != nil {
		return f.err
	}
	row.ID = uint64(len(f.rows) + 1)
	f.rows = append(f.rows, row)
	return nil
}

type countingNotifier struct{ n int }

func (c *countingNotifier) Notify() { c.n++ }

func enabledConfig() Config {
	return Config{
		Enabled: true, Driver: DriverSMTP, FromAddress: "devlake-alerts@arbisoft.com", FromName: "DevLake",
		AllowedDomains: []string{"arbisoft.com"}, MaxRetries: 3,
		SMTP: SMTPConfig{Host: "smtp.gmail.com", Port: 587, Username: "u", Password: "secret", Security: SecurityStartTLS, Auth: AuthPlain, Timeout: time.Second},
	}
}

func newTestService(t *testing.T, cfg Config, reason string) (*Service, *fakeHistory, *countingNotifier) {
	t.Helper()
	history, queue := &fakeHistory{}, &countingNotifier{}
	svc, err := NewService(cfg, reason, builtinRenderer(t), history, queue, WithServiceClock(func() time.Time { return fixedNow }))
	require.Nil(t, err)
	return svc, history, queue
}

func alertRequest() SendRequest {
	return SendRequest{
		Template:    TemplateAlert,
		Data:        AlertData{Title: "OTel down", Summary: "No data."},
		Recipients:  []string{"Ali@arbisoft.com", "ali@arbisoft.com", "x@gmail.com", "legacy"},
		ProjectName: "DevLake",
		Source:      "otel_monitor",
		SourceID:    "conn-7",
		SentBy:      "",
	}
}

func TestSendQueuesARowAndWakesTheWorker(t *testing.T) {
	svc, history, queue := newTestService(t, enabledConfig(), "")

	res, err := svc.Send(alertRequest())

	require.Nil(t, err)
	assert.Equal(t, &SendResult{ID: 1, Status: models.EmailStatusQueued, Recipients: 1}, res)
	assert.Equal(t, 1, queue.n)
	require.Len(t, history.rows, 1)
	row := history.rows[0]
	assert.Equal(t, "devlake-alerts@arbisoft.com", row.Sender)
	assert.Equal(t, "ali@arbisoft.com", row.Recipients)
	assert.Equal(t, "[DevLake alert] OTel down", row.Subject)
	assert.Contains(t, row.Content, "<!DOCTYPE html>")
	assert.Contains(t, row.TextContent, "No data.")
	assert.Equal(t, models.EmailStatusQueued, row.Status)
	assert.Equal(t, models.EmailSentBySystem, row.SentBy)
	assert.Equal(t, TemplateAlert, row.Template)
	assert.Equal(t, "DevLake", *row.ProjectName)
	assert.Equal(t, "otel_monitor", *row.Source)
	assert.Equal(t, "conn-7", *row.SourceId)
	assert.Equal(t, "smtp:smtp.gmail.com", row.Provider)
	assert.Nil(t, row.SentOn)
	assert.Zero(t, row.Attempts)
	assert.Equal(t, fixedNow, row.CreatedAt)
}

func TestSendKeepsTheUserLoginAndNullsEmptyOptionals(t *testing.T) {
	svc, history, _ := newTestService(t, enabledConfig(), "")
	req := alertRequest()
	req.SentBy, req.ProjectName, req.Source, req.SourceID = "admin@arbisoft.com", " ", "", ""

	_, err := svc.Send(req)

	require.Nil(t, err)
	row := history.rows[0]
	assert.Equal(t, "admin@arbisoft.com", row.SentBy)
	assert.Nil(t, row.ProjectName)
	assert.Nil(t, row.Source)
	assert.Nil(t, row.SourceId)
}

func TestSendRefusesWithoutRecording(t *testing.T) {
	disabled := enabledConfig()
	disabled.Enabled = false
	cases := []struct {
		name   string
		cfg    Config
		mutate func(*SendRequest)
		kind   *errors.Type
		want   string
	}{
		{"mail off", disabled, func(*SendRequest) {}, errors.Conflict, "mail is disabled"},
		{"no recipients left", enabledConfig(), func(r *SendRequest) { r.Recipients = []string{"x@gmail.com", "legacy"} },
			errors.BadInput, "no valid recipients: 1 invalid, 1 outside the allowed domains"},
		{"no template", enabledConfig(), func(r *SendRequest) { r.Template = "" }, errors.BadInput, "template is required"},
		{"unknown template", enabledConfig(), func(r *SendRequest) { r.Template = "digest" }, errors.BadInput, "unknown mail template digest"},
		{"source too long", enabledConfig(), func(r *SendRequest) { r.Source = strings.Repeat("s", 101) }, errors.BadInput, "source must be at most 100 characters"},
		{"project too long", enabledConfig(), func(r *SendRequest) { r.ProjectName = strings.Repeat("p", 256) }, errors.BadInput, "projectName must be at most 255 characters"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			svc, history, queue := newTestService(t, tc.cfg, "")
			req := alertRequest()
			tc.mutate(&req)

			res, err := svc.Send(req)

			assert.Nil(t, res)
			require.NotNil(t, err)
			assert.Equal(t, tc.kind, err.GetType())
			assert.Contains(t, err.Error(), tc.want)
			assert.Empty(t, history.rows)
			assert.Zero(t, queue.n)
		})
	}
}

func TestSendReturnsTheStoreError(t *testing.T) {
	svc, history, queue := newTestService(t, enabledConfig(), "")
	history.err = errors.Default.New("db down")

	_, err := svc.Send(alertRequest())

	require.NotNil(t, err)
	assert.Contains(t, err.Error(), "db down")
	assert.Zero(t, queue.n, "the worker isn't woken when nothing was recorded")
}

func TestStatusHasNoSecrets(t *testing.T) {
	svc, _, _ := newTestService(t, enabledConfig(), "")

	st := svc.Status()

	assert.Equal(t, Status{
		Enabled: true, Driver: DriverSMTP, Host: "smtp.gmail.com", Port: 587, Security: SecurityStartTLS, Auth: AuthPlain,
		FromAddress: "devlake-alerts@arbisoft.com", FromName: "DevLake",
	}, st)
}

func TestStatusOfADisabledLogDriver(t *testing.T) {
	cfg := Config{Driver: DriverLog, FromAddress: "a@arbisoft.com", SMTP: SMTPConfig{Host: "ignored"}}
	svc, _, _ := newTestService(t, cfg, "SMTP_HOST is required")

	st := svc.Status()

	assert.False(t, st.Enabled)
	assert.Empty(t, st.Host, "SMTP details only apply to the smtp driver")
	assert.Equal(t, "SMTP_HOST is required", st.DisabledReason)
}

func TestNewServiceRejectsNil(t *testing.T) {
	r := builtinRenderer(t)
	_, err := NewService(Config{}, "", nil, &fakeHistory{}, &countingNotifier{})
	assert.NotNil(t, err)
	_, err = NewService(Config{}, "", r, nil, &countingNotifier{})
	assert.NotNil(t, err)
	_, err = NewService(Config{}, "", r, &fakeHistory{}, nil)
	assert.NotNil(t, err)
	_, err = NewService(Config{}, "", r, &fakeHistory{}, NotifyFunc(func() {}))
	assert.Nil(t, err)
}
