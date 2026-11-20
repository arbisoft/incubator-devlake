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

package service

import (
	"fmt"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models/domainlayer/crossdomain"
)

const accountNameRefreshInterval = 24 * time.Hour

// accountNameNow is the clock for name staleness; tests replace it.
var accountNameNow = time.Now

const (
	claudeAccountIDPrefix = "claude:ClaudeAccount:"
	// userKeyLength is the longest user key whose Claude account ID still fits the
	// accounts.id and ai_*.account_id columns, given the 36-character organization UUID
	// that normalizeOrganizationID guarantees for the workspace key.
	userKeyLength = identityColumnLength - len(claudeAccountIDPrefix) - len("00000000-0000-0000-0000-000000000000") - len(":")
)

// claudeAccountID is the DevLake account ID of one Claude user in one organization. Like
// the canonical ai_* IDs, it has no connection or team component.
func claudeAccountID(workspaceKey, userKey string) string {
	return claudeAccountIDPrefix + workspaceKey + ":" + userKey
}

// ensureClaudeAccount writes the Claude user's row in accounts and returns its ID, applying
// the batch's values with mergeClaudeAccount. An unchanged account is not rewritten.
// Claude sends no display name, so full_name is copied from another DevLake account with
// the same email and stays NULL when none has one. Daily re-checks only take a GitHub or Jira name.
func ensureClaudeAccount(tx dal.Transaction, workspaceKey, userKey string, userAccountID *string, email string) (string, error) {
	id := claudeAccountID(workspaceKey, userKey)
	stored := crossdomain.Account{}
	found := true
	if err := tx.First(&stored, dal.Where("id = ?", id)); err != nil {
		if !tx.IsErrorNotFound(err) {
			return "", fmt.Errorf("load Claude OTel domain account: %w", err)
		}
		found = false
	}
	merged, needsName := mergeClaudeAccount(stored, stringValue(userAccountID), email)
	stale := found && accountNameIsStale(stored.UpdatedAt, accountNameNow())
	if needsName {
		name, err := fullNameForEmail(tx, merged.Email)
		if err != nil {
			return "", err
		}
		merged.FullName = name
	} else if stale {
		name, err := trustedFullNameForEmail(tx, merged.Email)
		if err != nil {
			return "", err
		}
		if name != "" {
			merged.FullName = name
		}
	}
	if found && !stale && sameClaudeAccount(stored, merged) {
		return id, nil
	}
	// The model's FullName is a plain string, so the row is written directly to store an
	// unknown name as NULL rather than ''.
	err := tx.Exec(
		"INSERT INTO "+(&crossdomain.Account{}).TableName()+" (id, email, user_name, full_name, created_at, updated_at) "+
			"VALUES (?, ?, ?, NULLIF(?, ''), NOW(), NOW()) AS incoming "+
			"ON DUPLICATE KEY UPDATE email = incoming.email, user_name = incoming.user_name, full_name = incoming.full_name, updated_at = NOW()",
		id, merged.Email, merged.UserName, merged.FullName,
	)
	if err != nil {
		return "", fmt.Errorf("write Claude OTel domain account: %w", err)
	}
	return id, nil
}

// accountNameIsStale reports that the stored name was last written a refresh interval ago or more.
func accountNameIsStale(updatedAt, now time.Time) bool {
	if updatedAt.IsZero() {
		return false
	}
	return now.Sub(updatedAt) >= accountNameRefreshInterval
}

// mergeClaudeAccount applies one batch's Claude account ID and email to the stored account.
// A value the telemetry omits keeps its stored value. needsName reports that the stored
// full name can't be kept, because there is none or the email changed, so the caller must
// look it up again for the merged email.
func mergeClaudeAccount(stored crossdomain.Account, userName, email string) (merged crossdomain.Account, needsName bool) {
	merged = crossdomain.Account{Email: stored.Email, UserName: stored.UserName, FullName: stored.FullName}
	if email != "" {
		merged.Email = email
	}
	if userName != "" {
		merged.UserName = userName
	}
	return merged, merged.FullName == "" || merged.Email != stored.Email
}

// sameClaudeAccount reports whether the columns ensureClaudeAccount writes are unchanged.
func sameClaudeAccount(stored, merged crossdomain.Account) bool {
	return stored.Email == merged.Email && stored.UserName == merged.UserName && stored.FullName == merged.FullName
}

// fullNameForEmail returns the name on another DevLake account (Jira, GitHub, git, ...) with
// this email, or "" when there is none. GitHub wins, then Jira, then other tool accounts,
// then git authors (ids without a prefix), with the lowest id winning within a source.
// The match ignores case: accounts.email is utf8mb4_bin, and other plugins store the
// email as their source sent it, while Claude emails are lowercased.
func fullNameForEmail(tx dal.Transaction, email string) (string, error) {
	return lookupFullName(tx, email, "", "CASE WHEN id LIKE 'github:%' THEN 0 WHEN id LIKE 'jira:%' THEN 1 WHEN id LIKE '%:%' THEN 2 ELSE 3 END, id ASC")
}

// trustedFullNameForEmail is fullNameForEmail limited to GitHub and Jira accounts, GitHub first.
func trustedFullNameForEmail(tx dal.Transaction, email string) (string, error) {
	return lookupFullName(tx, email, " AND (id LIKE 'github:%' OR id LIKE 'jira:%')", "CASE WHEN id LIKE 'github:%' THEN 0 ELSE 1 END, id ASC")
}

func lookupFullName(tx dal.Transaction, email, extraCondition, order string) (string, error) {
	if email == "" {
		return "", nil
	}
	account := &crossdomain.Account{}
	err := tx.First(account,
		dal.Where("LOWER(email) = ? AND id NOT LIKE ? AND full_name IS NOT NULL AND full_name <> ''"+extraCondition, strings.ToLower(email), "claude:%"),
		dal.Orderby(order),
	)
	if err != nil {
		if tx.IsErrorNotFound(err) {
			return "", nil
		}
		return "", fmt.Errorf("look up Claude OTel account name: %w", err)
	}
	return account.FullName, nil
}
