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

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/log"
)

// loginLister returns the user logins mapped to a project.
type loginLister interface {
	ProjectLogins(projectName string) ([]string, errors.Error)
}

// recipientFilter is the result of checking candidate addresses.
type recipientFilter struct {
	Valid          []string // lowercase, de-duplicated, in first-seen order
	Invalid        []string // values that aren't a single bare email address
	OutsideDomains int      // valid addresses whose domain isn't in the allow-list
}

// filterRecipients keeps the candidates that are valid addresses inside allowedDomains (all domains
// when it is empty), lowercased and de-duplicated. allowedDomains may be in any case. It does no I/O.
func filterRecipients(candidates []string, allowedDomains []string) recipientFilter {
	allowed := make(map[string]bool, len(allowedDomains))
	for _, d := range allowedDomains {
		allowed[strings.ToLower(strings.TrimSpace(d))] = true
	}
	out := recipientFilter{Valid: make([]string, 0, len(candidates))}
	seen := make(map[string]bool, len(candidates))
	for _, candidate := range candidates {
		addr, ok := normalizeAddress(candidate)
		if !ok {
			out.Invalid = append(out.Invalid, candidate)
			continue
		}
		if len(allowed) > 0 && !allowed[addr[strings.LastIndex(addr, "@")+1:]] {
			out.OutsideDomains++
			continue
		}
		if !seen[addr] {
			seen[addr] = true
			out.Valid = append(out.Valid, addr)
		}
	}
	return out
}

// RecipientResolver finds who gets a project's emails. Every caller goes through it, so the later
// opt-in/config table only changes this type. Nothing calls it yet: it was built for the alert and
// report emails (US-42, DEVLAKE-471), which will send to everyone mapped to a project. The project
// invite doesn't use it, because it goes to one given user.
type RecipientResolver struct {
	logins         loginLister
	allowedDomains []string
	logger         log.Logger
}

// NewRecipientResolver returns a resolver. logins and logger must not be nil; allowedDomains may be in
// any case, and empty to allow every domain.
func NewRecipientResolver(logins loginLister, allowedDomains []string, logger log.Logger) (*RecipientResolver, errors.Error) {
	if logins == nil || logger == nil {
		return nil, errors.Default.New("recipient resolver: nil dependency")
	}
	return &RecipientResolver{
		logins:         logins,
		allowedDomains: append([]string(nil), allowedDomains...),
		logger:         logger,
	}, nil
}

// RecipientsForProject returns the email addresses mapped to projectName in user_project_mapping.
// Logins that aren't emails and addresses outside MAIL_ALLOWED_RECIPIENT_DOMAINS are skipped and
// logged. An empty result is not an error.
func (r *RecipientResolver) RecipientsForProject(projectName string) ([]string, errors.Error) {
	projectName = strings.TrimSpace(projectName)
	if projectName == "" {
		return nil, errors.BadInput.New("projectName is required")
	}
	logins, err := r.logins.ProjectLogins(projectName)
	if err != nil {
		return nil, err
	}
	result := filterRecipients(logins, r.allowedDomains)
	if len(result.Invalid) > 0 {
		r.logger.Warn(nil, "mail recipients: skipped %d logins that aren't email addresses project=%q logins=%q",
			len(result.Invalid), projectName, result.Invalid)
	}
	if result.OutsideDomains > 0 {
		r.logger.Info("mail recipients: skipped %d addresses outside the allowed domains project=%q", result.OutsideDomains, projectName)
	}
	return result.Valid, nil
}
