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
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
)

// Column sizes of _devlake_email_history that request values must fit.
const (
	maxSourceLen      = 100
	maxSourceIDLen    = 255
	maxProjectNameLen = 255
	maxSentByLen      = 255
)

// historyWriter inserts a history row.
type historyWriter interface {
	Create(row *models.EmailHistory) errors.Error
}

// renderer renders a named template.
type renderer interface {
	Render(name string, data interface{}) (*Rendered, errors.Error)
}

// notifier wakes the sending worker.
type notifier interface {
	Notify()
}

// NotifyFunc adapts a function to the notifier the Service needs, for example a no-op when mail is off.
type NotifyFunc func()

// Notify calls f.
func (f NotifyFunc) Notify() { f() }

// SendRequest is one email to send. Typed backend functions build it; there is no public endpoint
// that sends arbitrary email.
type SendRequest struct {
	Template    string      // TemplateAlert, TemplateReport or TemplateProjectInvite
	Data        interface{} // AlertData, ReportData or ProjectInviteData, matching Template
	Recipients  []string    // candidate addresses; invalid ones and those outside the allow-list are dropped
	ProjectName string      // optional
	Source      string      // optional: what triggered the email, for example "mail_test"
	SourceID    string      // optional
	SentBy      string      // user login, or empty for models.EmailSentBySystem
}

// SendResult says what Send queued.
type SendResult struct {
	ID         uint64
	Status     string
	Recipients int
}

// Status is the mail setup without any secret.
type Status struct {
	Enabled        bool
	Driver         string
	Host           string
	Port           int
	Security       string
	Auth           string
	FromAddress    string
	FromName       string
	DisabledReason string
}

// Service renders an email, records it as QUEUED and wakes the worker that sends it.
type Service struct {
	cfg            Config
	disabledReason string
	renderer       renderer
	history        historyWriter
	queue          notifier
	now            func() time.Time
}

// ServiceOption changes a Service.
type ServiceOption func(*Service)

// WithServiceClock replaces the clock; tests pass a fixed time.
func WithServiceClock(now func() time.Time) ServiceOption {
	return func(s *Service) { s.now = now }
}

// NewService returns the mail service. disabledReason explains why mail is off when cfg.Enabled is
// false (empty when it is simply not turned on). The other dependencies must not be nil.
func NewService(cfg Config, disabledReason string, r renderer, history historyWriter, queue notifier, opts ...ServiceOption) (*Service, errors.Error) {
	if r == nil || history == nil || queue == nil {
		return nil, errors.Default.New("mail service: nil dependency")
	}
	s := &Service{cfg: cfg, disabledReason: disabledReason, renderer: r, history: history, queue: queue, now: time.Now}
	for _, opt := range opts {
		opt(s)
	}
	return s, nil
}

// Status returns the current mail setup. It never includes the SMTP username or password.
func (s *Service) Status() Status {
	st := Status{
		Enabled:        s.cfg.Enabled,
		Driver:         s.cfg.Driver,
		FromAddress:    s.cfg.FromAddress,
		FromName:       s.cfg.FromName,
		DisabledReason: s.disabledReason,
	}
	if s.cfg.Driver == DriverSMTP {
		st.Host, st.Port, st.Security, st.Auth = s.cfg.SMTP.Host, s.cfg.SMTP.Port, s.cfg.SMTP.Security, s.cfg.SMTP.Auth
	}
	return st
}

// Send renders req, writes a QUEUED history row and wakes the worker; it doesn't wait for the
// provider. It returns a Conflict error when mail is off, and a BadInput error when the request is
// invalid or no recipient is left after filtering. Nothing is recorded in either case.
func (s *Service) Send(req SendRequest) (*SendResult, errors.Error) {
	if !s.cfg.Enabled {
		return nil, errors.Conflict.New("mail is disabled")
	}
	if err := validateRequest(req); err != nil {
		return nil, err
	}
	recipients := filterRecipients(req.Recipients, s.cfg.AllowedDomains)
	if len(recipients.Valid) == 0 {
		return nil, errors.BadInput.New(fmt.Sprintf(
			"no valid recipients: %d invalid, %d outside the allowed domains", len(recipients.Invalid), recipients.OutsideDomains))
	}
	rendered, err := s.renderer.Render(req.Template, req.Data)
	if err != nil {
		return nil, err
	}
	now := s.now().UTC()
	row := &models.EmailHistory{
		Sender:      s.cfg.FromAddress,
		Recipients:  strings.Join(recipients.Valid, ","),
		Subject:     rendered.Subject,
		Content:     rendered.HTML,
		TextContent: rendered.Text,
		Status:      models.EmailStatusQueued,
		SentBy:      sentBy(req.SentBy),
		Template:    req.Template,
		ProjectName: optional(req.ProjectName),
		Source:      optional(req.Source),
		SourceId:    optional(req.SourceID),
		Provider:    s.cfg.Provider(),
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := s.history.Create(row); err != nil {
		return nil, err
	}
	s.queue.Notify()
	return &SendResult{ID: row.ID, Status: row.Status, Recipients: len(recipients.Valid)}, nil
}

// validateRequest checks that each value fits its history column.
func validateRequest(req SendRequest) errors.Error {
	if strings.TrimSpace(req.Template) == "" {
		return errors.BadInput.New("template is required")
	}
	limits := []struct {
		field, value string
		max          int
	}{
		{"projectName", req.ProjectName, maxProjectNameLen},
		{"source", req.Source, maxSourceLen},
		{"sourceId", req.SourceID, maxSourceIDLen},
		{"sentBy", req.SentBy, maxSentByLen},
	}
	for _, l := range limits {
		if utf8.RuneCountInString(l.value) > l.max {
			return errors.BadInput.New(fmt.Sprintf("%s must be at most %d characters", l.field, l.max))
		}
	}
	return nil
}

func sentBy(login string) string {
	if login = strings.TrimSpace(login); login != "" {
		return login
	}
	return models.EmailSentBySystem
}

// optional maps an empty string to NULL.
func optional(v string) *string {
	if v = strings.TrimSpace(v); v == "" {
		return nil
	}
	return &v
}
