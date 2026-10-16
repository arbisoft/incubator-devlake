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
	"strings"
	"testing"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/domainlayer/crossdomain"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
)

const testUserKey = "acct:user_1"

var testClaudeAccountID = claudeAccountID(testOrganizationID, testUserKey)

// The account is loaded by ID with one clause; the name lookup passes a where and an order.
func expectStoredAccount(transaction *dalmocks.Transaction, stored *crossdomain.Account) {
	transaction.On("First", mock.AnythingOfType("*crossdomain.Account"), mock.Anything).Run(func(args mock.Arguments) {
		*args.Get(0).(*crossdomain.Account) = *stored
	}).Return(nil).Once()
}

func expectNoStoredAccount(transaction *dalmocks.Transaction) {
	notFound := errors.NotFound.New("claude account not found")
	transaction.On("First", mock.AnythingOfType("*crossdomain.Account"), mock.Anything).Return(notFound).Once()
	transaction.On("IsErrorNotFound", notFound).Return(true).Once()
}

func expectNameLookup(transaction *dalmocks.Transaction, fullName string) {
	if fullName == "" {
		notFound := errors.NotFound.New("named account not found")
		transaction.On("First", mock.AnythingOfType("*crossdomain.Account"), mock.Anything, mock.Anything).Return(notFound).Once()
		transaction.On("IsErrorNotFound", notFound).Return(true).Once()
		return
	}
	transaction.On("First", mock.AnythingOfType("*crossdomain.Account"), mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		args.Get(0).(*crossdomain.Account).FullName = fullName
	}).Return(nil).Once()
}

func expectAccountWrite(transaction *dalmocks.Transaction, email, userName, fullName string) {
	transaction.On("Exec", mock.MatchedBy(func(query string) bool {
		return strings.HasPrefix(query, "INSERT INTO accounts ") && strings.Contains(query, "NULLIF(?, '')")
	}), testClaudeAccountID, email, userName, fullName).Return(nil).Once()
}

func TestClaudeAccountIDUsesProviderPrefix(t *testing.T) {
	if got := claudeAccountID(testOrganizationID, testUserKey); got != "claude:ClaudeAccount:"+testOrganizationID+":acct:user_1" {
		t.Fatalf("claudeAccountID() = %q", got)
	}
}

func TestClaudeAccountIDSeparatesOrganizations(t *testing.T) {
	if claudeAccountID("org-a", testUserKey) == claudeAccountID("org-b", testUserKey) {
		t.Fatal("the same user key in two organizations must get two accounts")
	}
}

func TestEnsureClaudeAccountCreatesAccountWithFoundName(t *testing.T) {
	userAccountID := "user_1"
	transaction := dalmocks.NewTransaction(t)
	notFound := errors.NotFound.New("claude account not found")
	transaction.On("First", mock.AnythingOfType("*crossdomain.Account"), mock.MatchedBy(func(clause dal.Clause) bool {
		where, ok := clause.Data.(dal.DalClause)
		return ok && where.Expr == "id = ?" && len(where.Params) == 1 && where.Params[0] == testClaudeAccountID
	})).Return(notFound).Once()
	transaction.On("IsErrorNotFound", notFound).Return(true).Once()
	expectNameLookup(transaction, "Dev Name")
	expectAccountWrite(transaction, "dev@example.com", userAccountID, "Dev Name")

	got, err := ensureClaudeAccount(transaction, testOrganizationID, testUserKey, &userAccountID, "dev@example.com")
	if err != nil || got != testClaudeAccountID {
		t.Fatalf("ensureClaudeAccount() = %q, %v", got, err)
	}
}

func TestEnsureClaudeAccountWritesNullNameWhenNoneFound(t *testing.T) {
	transaction := dalmocks.NewTransaction(t)
	expectNoStoredAccount(transaction)
	expectNameLookup(transaction, "")
	// "" is sent for full_name; the query's NULLIF stores it as NULL.
	expectAccountWrite(transaction, "dev@example.com", "", "")

	if _, err := ensureClaudeAccount(transaction, testOrganizationID, testUserKey, nil, "dev@example.com"); err != nil {
		t.Fatalf("ensureClaudeAccount() error = %v", err)
	}
}

func TestEnsureClaudeAccountWithoutEmailSkipsNameLookup(t *testing.T) {
	transaction := dalmocks.NewTransaction(t)
	expectNoStoredAccount(transaction)
	expectAccountWrite(transaction, "", "", "")

	if _, err := ensureClaudeAccount(transaction, testOrganizationID, testUserKey, nil, ""); err != nil {
		t.Fatalf("ensureClaudeAccount() error = %v", err)
	}
}

func TestEnsureClaudeAccountSkipsUnchangedAccount(t *testing.T) {
	userAccountID := "user_1"
	stored := &crossdomain.Account{Email: "dev@example.com", UserName: userAccountID, FullName: "Dev Name"}

	// The name is already known and nothing changed, with or without an email on the
	// batch: no lookup and no write.
	for _, email := range []string{"dev@example.com", ""} {
		transaction := dalmocks.NewTransaction(t)
		expectStoredAccount(transaction, stored)
		got, err := ensureClaudeAccount(transaction, testOrganizationID, testUserKey, &userAccountID, email)
		if err != nil || got != testClaudeAccountID {
			t.Fatalf("ensureClaudeAccount(email %q) = %q, %v", email, got, err)
		}
	}
}

func TestEnsureClaudeAccountFillsMissingNameOnExistingAccount(t *testing.T) {
	transaction := dalmocks.NewTransaction(t)
	// Accounts written before the name lookup existed have full_name ''.
	expectStoredAccount(transaction, &crossdomain.Account{Email: "dev@example.com", UserName: "user_1"})
	expectNameLookup(transaction, "Dev Name")
	expectAccountWrite(transaction, "dev@example.com", "user_1", "Dev Name")

	if _, err := ensureClaudeAccount(transaction, testOrganizationID, testUserKey, nil, "dev@example.com"); err != nil {
		t.Fatalf("ensureClaudeAccount() error = %v", err)
	}
}

func TestEnsureClaudeAccountRetriesNameUntilFound(t *testing.T) {
	transaction := dalmocks.NewTransaction(t)
	// Still no name anywhere: the lookup runs, nothing changed, so nothing is written.
	expectStoredAccount(transaction, &crossdomain.Account{Email: "dev@example.com", UserName: "user_1"})
	expectNameLookup(transaction, "")

	if _, err := ensureClaudeAccount(transaction, testOrganizationID, testUserKey, nil, "dev@example.com"); err != nil {
		t.Fatalf("ensureClaudeAccount() error = %v", err)
	}
}

func TestEnsureClaudeAccountKeepsStoredValuesWhenTelemetryOmitsThem(t *testing.T) {
	transaction := dalmocks.NewTransaction(t)
	expectStoredAccount(transaction, &crossdomain.Account{Email: "dev@example.com", UserName: "user_1"})
	// The lookup uses the stored email, and the write keeps the stored email and user name.
	transaction.On("First", mock.AnythingOfType("*crossdomain.Account"), mock.MatchedBy(func(clause dal.Clause) bool {
		where, ok := clause.Data.(dal.DalClause)
		return ok && len(where.Params) > 0 && where.Params[0] == "dev@example.com"
	}), mock.Anything).Run(func(args mock.Arguments) {
		args.Get(0).(*crossdomain.Account).FullName = "Dev Name"
	}).Return(nil).Once()
	expectAccountWrite(transaction, "dev@example.com", "user_1", "Dev Name")

	if _, err := ensureClaudeAccount(transaction, testOrganizationID, testUserKey, nil, ""); err != nil {
		t.Fatalf("ensureClaudeAccount() error = %v", err)
	}
}

func TestEnsureClaudeAccountUpdatesChangedUserAccountID(t *testing.T) {
	userAccountID := "user_2"
	transaction := dalmocks.NewTransaction(t)
	expectStoredAccount(transaction, &crossdomain.Account{Email: "dev@example.com", UserName: "user_1", FullName: "Dev Name"})
	// Same email and a known name: the name is kept without a lookup.
	expectAccountWrite(transaction, "dev@example.com", userAccountID, "Dev Name")

	if _, err := ensureClaudeAccount(transaction, testOrganizationID, testUserKey, &userAccountID, "dev@example.com"); err != nil {
		t.Fatalf("ensureClaudeAccount() error = %v", err)
	}
}

func TestEnsureClaudeAccountRelooksUpNameWhenEmailChanges(t *testing.T) {
	transaction := dalmocks.NewTransaction(t)
	expectStoredAccount(transaction, &crossdomain.Account{Email: "old@example.com", FullName: "Old Name"})
	expectNameLookup(transaction, "New Name")
	expectAccountWrite(transaction, "new@example.com", "", "New Name")

	if _, err := ensureClaudeAccount(transaction, testOrganizationID, testUserKey, nil, "new@example.com"); err != nil {
		t.Fatalf("ensureClaudeAccount() error = %v", err)
	}
}

func TestEnsureClaudeAccountDropsOldNameWhenNewEmailHasNone(t *testing.T) {
	transaction := dalmocks.NewTransaction(t)
	expectStoredAccount(transaction, &crossdomain.Account{Email: "old@example.com", FullName: "Old Name"})
	expectNameLookup(transaction, "")
	expectAccountWrite(transaction, "new@example.com", "", "")

	if _, err := ensureClaudeAccount(transaction, testOrganizationID, testUserKey, nil, "new@example.com"); err != nil {
		t.Fatalf("ensureClaudeAccount() error = %v", err)
	}
}

func TestEnsureClaudeAccountReturnsLoadError(t *testing.T) {
	failure := errors.Default.New("connection lost")
	transaction := dalmocks.NewTransaction(t)
	transaction.On("First", mock.AnythingOfType("*crossdomain.Account"), mock.Anything).Return(failure).Once()
	transaction.On("IsErrorNotFound", failure).Return(false).Once()

	if _, err := ensureClaudeAccount(transaction, testOrganizationID, testUserKey, nil, "dev@example.com"); err == nil || !strings.Contains(err.Error(), "load Claude OTel domain account") {
		t.Fatalf("ensureClaudeAccount() error = %v, want the load error and no write", err)
	}
}

func TestEnsureClaudeAccountReturnsNameLookupError(t *testing.T) {
	failure := errors.Default.New("connection lost")
	transaction := dalmocks.NewTransaction(t)
	expectNoStoredAccount(transaction)
	transaction.On("First", mock.AnythingOfType("*crossdomain.Account"), mock.Anything, mock.Anything).Return(failure).Once()
	transaction.On("IsErrorNotFound", failure).Return(false).Once()

	if _, err := ensureClaudeAccount(transaction, testOrganizationID, testUserKey, nil, "dev@example.com"); err == nil || !strings.Contains(err.Error(), "look up Claude OTel account name") {
		t.Fatalf("ensureClaudeAccount() error = %v, want the lookup error and no write", err)
	}
}

func TestEnsureClaudeAccountReturnsWriteError(t *testing.T) {
	transaction := dalmocks.NewTransaction(t)
	expectNoStoredAccount(transaction)
	expectNameLookup(transaction, "")
	transaction.On("Exec", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(errors.Default.New("deadlock")).Once()

	if _, err := ensureClaudeAccount(transaction, testOrganizationID, testUserKey, nil, "dev@example.com"); err == nil || !strings.Contains(err.Error(), "write Claude OTel domain account") {
		t.Fatalf("ensureClaudeAccount() error = %v, want the write error", err)
	}
}

func TestFullNameForEmailSkipsClaudeAndUnnamedAccounts(t *testing.T) {
	transaction := dalmocks.NewTransaction(t)
	transaction.On("First", mock.AnythingOfType("*crossdomain.Account"),
		mock.MatchedBy(func(clause dal.Clause) bool {
			where, ok := clause.Data.(dal.DalClause)
			return ok && clause.Type == dal.WhereClause &&
				strings.Contains(where.Expr, "email = ?") && strings.Contains(where.Expr, "id NOT LIKE ?") &&
				strings.Contains(where.Expr, "full_name IS NOT NULL") && strings.Contains(where.Expr, "full_name <> ''") &&
				len(where.Params) == 2 && where.Params[0] == "dev@example.com" && where.Params[1] == "claude:%"
		}),
		mock.MatchedBy(func(clause dal.Clause) bool { return clause.Type == dal.OrderbyClause && clause.Data == "id ASC" }),
	).Run(func(args mock.Arguments) {
		args.Get(0).(*crossdomain.Account).FullName = "Dev Name"
	}).Return(nil).Once()

	if got, err := fullNameForEmail(transaction, "dev@example.com"); err != nil || got != "Dev Name" {
		t.Fatalf("fullNameForEmail() = %q, %v", got, err)
	}
}

func TestFullNameForEmailWithoutEmailRunsNoQuery(t *testing.T) {
	transaction := dalmocks.NewTransaction(t)
	if got, err := fullNameForEmail(transaction, ""); err != nil || got != "" {
		t.Fatalf("fullNameForEmail() = %q, %v", got, err)
	}
}

func TestResolveDomainAccountUsesFirstEmailAcrossFacts(t *testing.T) {
	userAccountID := "user_1"
	email := "dev@example.com"
	target := dailyTarget{workspaceKey: testOrganizationID, userKey: testUserKey, userAccountID: &userAccountID}
	transaction := dalmocks.NewTransaction(t)
	expectNoStoredAccount(transaction)
	expectNameLookup(transaction, "Dev Name")
	expectAccountWrite(transaction, email, userAccountID, "Dev Name")

	// The activity row has no email, so the model row's email is used.
	accountID, gotEmail, err := resolveDomainAccount(transaction, target,
		[]*models.OtelHourlyActivity{{}}, []*models.OtelHourlyModelUsage{{UserEmail: &email}}, nil)
	if err != nil || accountID != testClaudeAccountID || gotEmail != email {
		t.Fatalf("resolveDomainAccount() = %q, %q, %v", accountID, gotEmail, err)
	}
}

func TestResolveDomainAccountReturnsAccountError(t *testing.T) {
	failure := errors.Default.New("connection lost")
	transaction := dalmocks.NewTransaction(t)
	transaction.On("First", mock.AnythingOfType("*crossdomain.Account"), mock.Anything).Return(failure).Once()
	transaction.On("IsErrorNotFound", failure).Return(false).Once()

	accountID, email, err := resolveDomainAccount(transaction, dailyTarget{workspaceKey: testOrganizationID, userKey: testUserKey}, nil, nil, nil)
	if err == nil || accountID != "" || email != "" {
		t.Fatalf("resolveDomainAccount() = %q, %q, %v, want an error and no account", accountID, email, err)
	}
}
