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
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
)

func TestSessionHourTargetsSkipsMissingSessionsAndDeduplicates(t *testing.T) {
	hour := time.Date(2026, 10, 12, 9, 0, 0, 0, time.UTC)
	update := func(sessionID string, hour time.Time) factUpdate {
		return factUpdate{organizationID: testOrganizationID, identity: developerIdentity{key: "acct:user_1"}, hour: hour, session: sessionAttributes{id: sessionID}}
	}

	targets := sessionHourTargets([]factUpdate{
		update("session-a", hour), update("session-a", hour), update("", hour),
		update("session-b", hour), update("session-a", hour.Add(time.Hour)),
	})
	if len(targets) != 3 {
		t.Fatalf("sessionHourTargets() = %#v, want session-a twice (two hours) and session-b once", targets)
	}
}

func TestCanonicalSessionHourSumsConnections(t *testing.T) {
	hour := time.Date(2026, 10, 12, 9, 0, 0, 0, time.UTC)
	target := sessionHourTarget{workspaceKey: testOrganizationID, userKey: "acct:user_1", sessionID: "session-a", hour: hour}
	rows := []*models.OtelSessionHour{
		{ConnectionId: 1, AppVersion: "2.1.0", InputTokens: 10, ActiveTimeSeconds: "1.5", EstimatedCostUSD: "0.01", AcceptedCount: 1,
			FirstObservedAt: hour.Add(20 * time.Minute), LastObservedAt: hour.Add(30 * time.Minute)},
		{ConnectionId: 2, TerminalType: "vscode", InputTokens: 5, ActiveTimeSeconds: "2.25", EstimatedCostUSD: "0.02", RejectedCount: 2,
			FirstObservedAt: hour.Add(5 * time.Minute), LastObservedAt: hour.Add(50 * time.Minute)},
	}

	got, err := canonicalSessionHour(target, "account-1", "dev@example.com", rows)
	if err != nil {
		t.Fatalf("canonicalSessionHour() error = %v", err)
	}
	if got.Id != ai.CanonicalSessionHourID(aiProviderClaude, testOrganizationID, "acct:user_1", "session-a", hour) {
		t.Fatalf("Id = %q, want the canonical session hour ID", got.Id)
	}
	if got.InputTokens != 15 || got.ActiveTimeSeconds != "3.750" || got.EstimatedCostUsd != "0.03000000" || got.AcceptedCount != 1 || got.RejectedCount != 2 {
		t.Fatalf("totals = tokens %d, active %s, cost %s, decisions %d/%d", got.InputTokens, got.ActiveTimeSeconds, got.EstimatedCostUsd, got.AcceptedCount, got.RejectedCount)
	}
	if got.TerminalType != "vscode" || got.ClientVersion != "2.1.0" {
		t.Fatalf("client = %q %q, want details from whichever row has them", got.TerminalType, got.ClientVersion)
	}
	if !got.FirstObservedAt.Equal(hour.Add(5*time.Minute)) || !got.LastObservedAt.Equal(hour.Add(50*time.Minute)) || !got.SourceUpdatedAt.Equal(got.LastObservedAt) {
		t.Fatalf("observed range = %s..%s, source updated %s", got.FirstObservedAt, got.LastObservedAt, got.SourceUpdatedAt)
	}
	if got.SourceConnectionId != nil {
		t.Fatalf("SourceConnectionId = %d, want nil for rows from two connections", *got.SourceConnectionId)
	}
}

func TestReconcileOtelSessionHoursWritesDomainRow(t *testing.T) {
	hour := time.Date(2026, 10, 12, 9, 0, 0, 0, time.UTC)
	email := "dev@example.com"
	target := sessionHourTarget{workspaceKey: testOrganizationID, userKey: "acct:user_1", sessionID: "session-a", hour: hour}
	notFound := errors.NotFound.New("account not found")
	transaction := dalmocks.NewTransaction(t)
	transaction.On("All", mock.AnythingOfType("*[]*models.OtelSessionHour"), mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		*args.Get(0).(*[]*models.OtelSessionHour) = []*models.OtelSessionHour{{ConnectionId: 7, UserEmail: &email, LinesAdded: 4, ActiveTimeSeconds: "0", EstimatedCostUSD: "0"}}
	}).Return(nil).Once()
	transaction.On("First", mock.Anything, mock.Anything, mock.Anything).Return(notFound).Once()
	transaction.On("IsErrorNotFound", notFound).Return(true).Once()
	transaction.On("CreateOrUpdate", mock.MatchedBy(func(row *ai.AiSessionHour) bool {
		return row.SessionId == "session-a" && row.UserEmail == email && row.AccountId == "" && row.LinesAdded == 4 &&
			row.SourceConnectionId != nil && *row.SourceConnectionId == 7
	})).Return(nil).Once()

	if err := reconcileOtelSessionHours(transaction, []sessionHourTarget{target}); err != nil {
		t.Fatalf("reconcileOtelSessionHours() error = %v", err)
	}
}
