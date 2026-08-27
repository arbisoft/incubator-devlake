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
	"fmt"
	"net/mail"
	"strings"
)

const invitationSubjectPrefix = "email:"

func normalizeEmail(raw string) string { return strings.ToLower(strings.TrimSpace(raw)) }

func invitationSubject(email string) string { return invitationSubjectPrefix + email }

func normalizeDomain(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func validDomain(domain string) bool {
	if domain == "" || strings.ContainsAny(domain, "@ \t\r\n") || strings.HasPrefix(domain, ".") || strings.HasSuffix(domain, ".") || strings.Contains(domain, "..") || isIPLiteralDomain(domain) {
		return false
	}
	parsed, ok := emailDomain("access@" + domain)
	return ok && parsed == domain
}

func emailDomain(email string) (string, bool) {
	parsed, err := mail.ParseAddress(email)
	if err != nil || normalizeEmail(parsed.Address) != email {
		return "", false
	}
	parts := strings.Split(email, "@")
	if len(parts) != 2 || parts[1] == "" {
		return "", false
	}
	domain := normalizeDomain(parts[1])
	if isIPLiteralDomain(domain) {
		return "", false
	}
	return domain, true
}

func domainAuditDetail(domain string) string { return fmt.Sprintf("domain=%s", domain) }

func isIPLiteralDomain(domain string) bool {
	return strings.HasPrefix(domain, "[") && strings.HasSuffix(domain, "]")
}

func validRole(role string) bool     { return role == RoleCustomerAdmin || role == RoleMember }
func validStatus(status string) bool { return status == StatusActive || status == StatusDisabled }
