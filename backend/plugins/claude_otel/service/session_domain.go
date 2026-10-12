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
	"sort"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models/domainlayer"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

type sessionHourTarget struct {
	workspaceKey  string
	userKey       string
	userAccountID *string
	sessionID     string
	hour          time.Time
}

// sessionHourTargets lists the session hours a batch touched. Updates without a session id
// have no session-hour row and are skipped.
func sessionHourTargets(updates []factUpdate) []sessionHourTarget {
	seen := make(map[string]sessionHourTarget)
	for _, update := range updates {
		if update.session.id == "" {
			continue
		}
		target := sessionHourTarget{
			workspaceKey:  update.organizationID,
			userKey:       update.identity.key,
			userAccountID: update.identity.accountID,
			sessionID:     update.session.id,
			hour:          update.hour.UTC(),
		}
		seen[sessionHourTargetKey(target)] = target
	}
	targets := make([]sessionHourTarget, 0, len(seen))
	for _, target := range seen {
		targets = append(targets, target)
	}
	sort.Slice(targets, func(i, j int) bool { return sessionHourTargetKey(targets[i]) < sessionHourTargetKey(targets[j]) })
	return targets
}

func sessionHourTargetKey(target sessionHourTarget) string {
	return target.workspaceKey + "\x00" + target.userKey + "\x00" + target.sessionID + "\x00" + target.hour.Format(time.RFC3339)
}

// reconcileOtelSessionHours rebuilds each touched ai_session_hours row from the plugin's
// session-hour rows. Like the daily facts, the domain identity has no connection component,
// so rows from several connections in one workspace are summed.
func reconcileOtelSessionHours(tx dal.Transaction, targets []sessionHourTarget) error {
	accounts := make(map[string]string)
	for _, target := range targets {
		rows := make([]*models.OtelSessionHour, 0)
		if err := tx.All(&rows,
			dal.From(&models.OtelSessionHour{}),
			dal.Where("organization_id = ? AND user_key = ? AND session_id = ? AND hour_start = ?", target.workspaceKey, target.userKey, target.sessionID, target.hour),
		); err != nil {
			return fmt.Errorf("load Claude OTel session hours: %w", err)
		}
		if len(rows) == 0 {
			continue
		}
		email := ""
		for _, row := range rows {
			if row.UserEmail != nil {
				email = *row.UserEmail
				break
			}
		}
		accountKey := target.workspaceKey + "\x00" + target.userKey
		accountID, cached := accounts[accountKey]
		if !cached {
			var err error
			if accountID, err = ensureClaudeAccount(tx, target.workspaceKey, target.userKey, target.userAccountID, email); err != nil {
				return err
			}
			accounts[accountKey] = accountID
		}
		sessionHour, err := canonicalSessionHour(target, accountID, email, rows)
		if err != nil {
			return err
		}
		if err := tx.CreateOrUpdate(sessionHour); err != nil {
			return fmt.Errorf("write canonical Claude session hour: %w", err)
		}
	}
	return nil
}

func canonicalSessionHour(target sessionHourTarget, accountID, email string, rows []*models.OtelSessionHour) (*ai.AiSessionHour, error) {
	sessionHour := &ai.AiSessionHour{
		DomainEntity:      domainlayer.NewDomainEntity(ai.CanonicalSessionHourID(aiProviderClaude, target.workspaceKey, target.userKey, target.sessionID, target.hour)),
		Provider:          aiProviderClaude,
		WorkspaceKey:      target.workspaceKey,
		AccountId:         accountID,
		UserKey:           target.userKey,
		UserAccountId:     target.userAccountID,
		UserEmail:         email,
		SessionId:         target.sessionID,
		HourStart:         target.hour,
		ActiveTimeSeconds: "0.000", EstimatedCostUsd: "0.00000000",
		SourceType: aiSourceOtel,
	}
	connections := make(map[uint64]struct{})
	for _, row := range rows {
		sessionHour.TerminalType = firstNonEmpty(sessionHour.TerminalType, row.TerminalType)
		sessionHour.ClientVersion = firstNonEmpty(sessionHour.ClientVersion, row.AppVersion)
		sessionHour.OsType = firstNonEmpty(sessionHour.OsType, row.OsType)
		sessionHour.SessionCount += row.SessionCount
		sessionHour.LinesAdded += row.LinesAdded
		sessionHour.LinesRemoved += row.LinesRemoved
		sessionHour.CommitsCreated += row.CommitsCreated
		sessionHour.PrsCreated += row.PrsCreated
		sessionHour.InputTokens += row.InputTokens
		sessionHour.OutputTokens += row.OutputTokens
		sessionHour.CacheReadTokens += row.CacheReadTokens
		sessionHour.CacheCreationTokens += row.CacheCreationTokens
		sessionHour.AcceptedCount += row.AcceptedCount
		sessionHour.RejectedCount += row.RejectedCount
		activeTime, err := addDecimal(sessionHour.ActiveTimeSeconds, row.ActiveTimeSeconds, 3)
		if err != nil {
			return nil, permanentMetricError(errorInvalidDecimal, "aggregate canonical Claude session active time: %v", err)
		}
		sessionHour.ActiveTimeSeconds = activeTime
		cost, err := addDecimal(sessionHour.EstimatedCostUsd, row.EstimatedCostUSD, 8)
		if err != nil {
			return nil, permanentMetricError(errorInvalidDecimal, "aggregate canonical Claude session cost: %v", err)
		}
		sessionHour.EstimatedCostUsd = cost
		if sessionHour.FirstObservedAt.IsZero() || row.FirstObservedAt.Before(sessionHour.FirstObservedAt) {
			sessionHour.FirstObservedAt = row.FirstObservedAt
		}
		sessionHour.LastObservedAt = latestTime(sessionHour.LastObservedAt, row.LastObservedAt)
		connections[row.ConnectionId] = struct{}{}
	}
	sessionHour.SourceUpdatedAt = sessionHour.LastObservedAt
	sessionHour.SourceConnectionId = soleConnectionID(connections)
	return sessionHour, nil
}
