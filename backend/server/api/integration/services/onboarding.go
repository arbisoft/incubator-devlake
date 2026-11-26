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

package services

import (
	"fmt"
	"net/url"
	"strings"
	"unicode/utf8"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/server/api/integration/repositories"
	mailsvc "github.com/apache/incubator-devlake/server/services/mail"
)

const (
	// maxColumnLength is the size of the users and user_project_mapping columns the values are stored in.
	maxColumnLength = 255
	// inviteSource marks project invites in the email history.
	inviteSource = "integration_invite"
	// inviteTitle is the heading of the project invite email.
	inviteTitle = "Your DevLake project is ready"
	// projectPagePath is config-ui's project page, followed by the escaped project name.
	projectPagePath = "/projects/"
)

// scoreLabels is the compliance score for 0, 1, 2 and 3 of the three checks done.
var scoreLabels = [...]string{"0%", "33%", "67%", "100%"}

// projectFinder finds a project's stored name. repositories.Onboarding satisfies it.
type projectFinder interface {
	ProjectName(name string) (string, bool, errors.Error)
}

// accessStore is what ProjectAccess needs. repositories.Onboarding satisfies it.
type accessStore interface {
	projectFinder
	MapUser(email, name, projectName string) (repositories.UserMapping, errors.Error)
}

// inviteStore is what InviteSender reads. repositories.Onboarding satisfies it.
type inviteStore interface {
	projectFinder
	HasAccess(email, projectName string) (bool, errors.Error)
	UserName(email string) (string, bool, errors.Error)
	Compliance(projectName string) (*repositories.Compliance, errors.Error)
}

// inviteMailer queues an email. mail.Service satisfies it.
type inviteMailer interface {
	Send(req mailsvc.SendRequest) (*mailsvc.SendResult, errors.Error)
}

var (
	_ accessStore  = (*repositories.Onboarding)(nil)
	_ inviteStore  = (*repositories.Onboarding)(nil)
	_ inviteMailer = (*mailsvc.Service)(nil)
)

// ProjectAccess gives a user access to a project for the Integration Service, and keeps the user's name from the
// ERP in DevLake's users table. It is safe for concurrent use.
type ProjectAccess struct {
	store accessStore
}

// NewProjectAccess returns the service. store must not be nil.
func NewProjectAccess(store accessStore) (*ProjectAccess, errors.Error) {
	if store == nil {
		return nil, errors.Default.New("project access service: nil store")
	}
	return &ProjectAccess{store: store}, nil
}

// Map creates or renames the user with email and gives them access to projectName. Calling it again changes
// nothing. It returns a BadInput error naming the field when input is invalid, and a NotFound error when the
// project doesn't exist. Any email domain is accepted.
func (s *ProjectAccess) Map(projectName, email, name string) (*ProjectUserMapping, errors.Error) {
	projectName, email, err := projectAndEmail(projectName, email)
	if err != nil {
		return nil, err
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.BadInput.New("name is required")
	}
	if utf8.RuneCountInString(name) > maxColumnLength {
		return nil, errors.BadInput.New(fmt.Sprintf("name must be at most %d characters", maxColumnLength))
	}
	stored, err := findProject(s.store, projectName)
	if err != nil {
		return nil, err
	}
	result, err := s.store.MapUser(email, name, stored)
	if err != nil {
		return nil, err
	}
	return &ProjectUserMapping{
		ProjectName: stored, Email: email,
		UserCreated: result.UserCreated, NameUpdated: result.NameUpdated, AccessCreated: result.AccessCreated,
	}, nil
}

// InviteSender queues the email that tells a user their project is ready and what its compliance scorecard still
// needs. It is safe for concurrent use.
type InviteSender struct {
	store       inviteStore
	mailer      inviteMailer
	linkBaseURL string
}

// NewInviteSender returns the service. store and mailer must not be nil. linkBaseURL is config-ui's public address
// without a trailing /, or empty to send the email without a link.
func NewInviteSender(store inviteStore, mailer inviteMailer, linkBaseURL string) (*InviteSender, errors.Error) {
	if store == nil || mailer == nil {
		return nil, errors.Default.New("invite sender: nil dependency")
	}
	return &InviteSender{store: store, mailer: mailer, linkBaseURL: linkBaseURL}, nil
}

// Send queues a project invite to email, which must already have access to projectName and a users row from
// ProjectAccess.Map. Every call queues a new email. sentBy is recorded in the history. It returns a BadInput error
// for invalid input or a recipient outside MAIL_ALLOWED_RECIPIENT_DOMAINS, a NotFound error when the project, the
// access or the user is missing, and a Conflict error when mail is off.
func (s *InviteSender) Send(projectName, email, sentBy string) (*InviteEmail, errors.Error) {
	projectName, email, err := projectAndEmail(projectName, email)
	if err != nil {
		return nil, err
	}
	stored, err := findProject(s.store, projectName)
	if err != nil {
		return nil, err
	}
	hasAccess, err := s.store.HasAccess(email, stored)
	if err != nil {
		return nil, err
	}
	if !hasAccess {
		return nil, errors.NotFound.New("the user has no access to this project: call map-project-user first")
	}
	name, found, err := s.store.UserName(email)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, errors.NotFound.New("user not found: call map-project-user first")
	}
	compliance, err := s.store.Compliance(stored)
	if err != nil {
		return nil, err
	}
	queued, err := s.mailer.Send(mailsvc.SendRequest{
		Template:    mailsvc.TemplateProjectInvite,
		Data:        inviteData(name, stored, *compliance, s.linkBaseURL),
		Recipients:  []string{email},
		ProjectName: stored,
		Source:      inviteSource,
		// The project has its own column; the email alone always fits source_id's 255 characters.
		SourceID: email,
		SentBy:   sentBy,
	})
	if err != nil {
		return nil, err
	}
	return &InviteEmail{ID: queued.ID, Status: queued.Status}, nil
}

// inviteData fills the project invite template. It does no I/O.
func inviteData(name, projectName string, c repositories.Compliance, linkBaseURL string) mailsvc.ProjectInviteData {
	checks := []mailsvc.InviteCheck{
		check("Ticketing system", c.Issue, "Connect Jira, Plane or another issue tracker to the project."),
		check("Version control", c.PR, "Connect GitHub, GitLab or another code host to the project."),
		check("AI usage visibility", c.AI, "Connect Claude Code, GitHub Copilot, Cursor or another AI tool to the project."),
	}
	done := 0
	for _, ch := range checks {
		if ch.Done {
			done++
		}
	}
	data := mailsvc.ProjectInviteData{Title: inviteTitle, Name: name, ProjectName: projectName, Checks: checks, Score: scoreLabels[done]}
	if linkBaseURL != "" {
		data.Link = linkBaseURL + projectPagePath + url.PathEscape(projectName)
	}
	return data
}

func check(label string, v repositories.Visibility, hint string) mailsvc.InviteCheck {
	if v.Visible {
		return mailsvc.InviteCheck{Label: label, Done: true, Sources: v.Sources}
	}
	return mailsvc.InviteCheck{Label: label, Hint: hint}
}

// projectAndEmail trims projectName and checks it is present, and checks and lowercases email. Errors are BadInput
// and name the field.
func projectAndEmail(projectName, email string) (string, string, errors.Error) {
	projectName = strings.TrimSpace(projectName)
	if projectName == "" {
		return "", "", errors.BadInput.New("projectName is required")
	}
	if utf8.RuneCountInString(projectName) > maxColumnLength {
		return "", "", errors.BadInput.New(fmt.Sprintf("projectName must be at most %d characters", maxColumnLength))
	}
	normalized, err := normalizeEmail(email)
	if err != nil {
		return "", "", err
	}
	if len(normalized) > maxColumnLength {
		return "", "", errors.BadInput.New(fmt.Sprintf("email must be at most %d characters", maxColumnLength))
	}
	return projectName, normalized, nil
}

// findProject returns the stored name of projectName, or a NotFound error.
func findProject(store projectFinder, projectName string) (string, errors.Error) {
	stored, found, err := store.ProjectName(projectName)
	if err != nil {
		return "", err
	}
	if !found {
		return "", errors.NotFound.New("project not found")
	}
	return stored, nil
}
