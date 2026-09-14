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
	"math/big"
	"sort"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models/domainlayer"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/core/models/domainlayer/crossdomain"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

const (
	aiProviderClaude       = "claude"
	aiSourceOtel           = "otel"
	aiMetricFamilyCore     = "core_activity"
	aiMetricFamilyModel    = "model_usage"
	aiMetricFamilyTool     = "tool_usage"
	aiActivityTypeCodeEdit = "CODE_EDIT"
	aiInterfaceTypeCLI     = "cli"
)

type dailyTarget struct {
	workspaceKey  string
	userKey       string
	userAccountID string
	date          time.Time
}

func dailyTargets(updates []factUpdate) []dailyTarget {
	seen := make(map[string]dailyTarget)
	for _, update := range updates {
		if update.identity.accountID == nil {
			continue
		}
		target := dailyTarget{
			workspaceKey:  update.organizationID,
			userKey:       update.identity.key,
			userAccountID: *update.identity.accountID,
			date:          update.hour.UTC().Truncate(24 * time.Hour),
		}
		seen[dailyTargetKey(target)] = target
	}
	targets := make([]dailyTarget, 0, len(seen))
	for _, target := range seen {
		targets = append(targets, target)
	}
	sort.Slice(targets, func(i, j int) bool { return dailyTargetKey(targets[i]) < dailyTargetKey(targets[j]) })
	return targets
}

func dailyTargetKey(target dailyTarget) string {
	return target.workspaceKey + "\x00" + target.userKey + "\x00" + target.date.Format("2006-01-02")
}

// reconcileOtelDaily writes the only enabled v1 canonical candidate. The generic
// domain identity intentionally has no source connection or team component.
func reconcileOtelDaily(tx dal.Transaction, targets []dailyTarget) error {
	for _, target := range targets {
		if err := ensureOtelPreferences(tx, target.workspaceKey); err != nil {
			return err
		}
		if err := reconcileOtelDailyTarget(tx, target); err != nil {
			return err
		}
	}
	return nil
}

func ensureOtelPreferences(tx dal.Transaction, workspaceKey string) error {
	for _, family := range []string{aiMetricFamilyCore, aiMetricFamilyModel, aiMetricFamilyTool} {
		preference := &ai.AiSourcePreference{
			Provider:        aiProviderClaude,
			WorkspaceKey:    workspaceKey,
			MetricFamily:    family,
			PreferredSource: aiSourceOtel,
		}
		if err := tx.CreateIfNotExist(preference); err != nil {
			return fmt.Errorf("persist Claude OTel source preference: %w", err)
		}
	}
	return nil
}

func reconcileOtelDailyTarget(tx dal.Transaction, target dailyTarget) error {
	start := target.date.UTC()
	end := start.AddDate(0, 0, 1)
	activityRows := make([]*models.OtelHourlyActivity, 0)
	modelRows := make([]*models.OtelHourlyModelUsage, 0)
	toolRows := make([]*models.OtelHourlyToolUsage, 0)
	clauses := []dal.Clause{
		dal.Where("organization_id = ? AND user_key = ? AND hour_start >= ? AND hour_start < ?", target.workspaceKey, target.userKey, start, end),
	}
	if err := tx.All(&activityRows, append([]dal.Clause{dal.From(&models.OtelHourlyActivity{})}, clauses...)...); err != nil {
		return fmt.Errorf("load hourly Claude OTel activity facts: %w", err)
	}
	if err := tx.All(&modelRows, append([]dal.Clause{dal.From(&models.OtelHourlyModelUsage{})}, clauses...)...); err != nil {
		return fmt.Errorf("load hourly Claude OTel model facts: %w", err)
	}
	if err := tx.All(&toolRows, append([]dal.Clause{dal.From(&models.OtelHourlyToolUsage{})}, clauses...)...); err != nil {
		return fmt.Errorf("load hourly Claude OTel tool facts: %w", err)
	}

	accountID, email, err := resolveDomainAccount(tx, activityRows, modelRows, toolRows)
	if err != nil {
		return err
	}
	if len(activityRows) > 0 {
		if err := writeCanonicalActivity(tx, target, accountID, email, activityRows); err != nil {
			return err
		}
	}
	if err := writeCanonicalModelUsage(tx, target, accountID, email, modelRows); err != nil {
		return err
	}
	return writeCanonicalToolDecisions(tx, target, accountID, email, toolRows)
}

// resolveDomainAccount links the canonical row to a DevLake account by email when one
// exists. A missing account is normal; a lookup failure aborts the conversion.
func resolveDomainAccount(tx dal.Transaction, activityRows []*models.OtelHourlyActivity, modelRows []*models.OtelHourlyModelUsage, toolRows []*models.OtelHourlyToolUsage) (string, string, error) {
	email := firstEmail(activityRows, modelRows, toolRows)
	if email == "" {
		return "", "", nil
	}
	account := &crossdomain.Account{}
	if err := tx.First(account, dal.Where("email = ?", email)); err != nil {
		if tx.IsErrorNotFound(err) {
			return "", email, nil
		}
		return "", "", fmt.Errorf("resolve Claude OTel domain account: %w", err)
	}
	return account.Id, email, nil
}

func firstEmail(activityRows []*models.OtelHourlyActivity, modelRows []*models.OtelHourlyModelUsage, toolRows []*models.OtelHourlyToolUsage) string {
	for _, row := range activityRows {
		if row.UserEmail != nil {
			return *row.UserEmail
		}
	}
	for _, row := range modelRows {
		if row.UserEmail != nil {
			return *row.UserEmail
		}
	}
	for _, row := range toolRows {
		if row.UserEmail != nil {
			return *row.UserEmail
		}
	}
	return ""
}

func writeCanonicalActivity(tx dal.Transaction, target dailyTarget, accountID, email string, rows []*models.OtelHourlyActivity) error {
	var sessions, linesAdded, linesRemoved, commits, prs int64
	connections := make(map[uint64]struct{})
	updatedAt := time.Time{}
	for _, row := range rows {
		sessions += row.SessionCount
		linesAdded += row.LinesAdded
		linesRemoved += row.LinesRemoved
		commits += row.CommitsCreated
		prs += row.PrsCreated
		connections[row.ConnectionId] = struct{}{}
		updatedAt = latestTime(updatedAt, row.LastObservedAt)
	}
	activity := &ai.AiActivity{
		DomainEntity:  domainlayer.NewDomainEntity(ai.CanonicalActivityID(aiProviderClaude, target.workspaceKey, target.userKey, target.date, aiActivityTypeCodeEdit, aiInterfaceTypeCLI)),
		Provider:      aiProviderClaude,
		AccountId:     accountID,
		UserEmail:     email,
		Date:          target.date,
		Type:          aiActivityTypeCodeEdit,
		InterfaceType: aiInterfaceTypeCLI,
		NumSessions:   int(sessions), LinesAdded: int(linesAdded), LinesRemoved: int(linesRemoved), CommitsCreated: int(commits), PrsCreated: int(prs),
		WorkspaceKey:       stringPointer(target.workspaceKey),
		UserKey:            stringPointer(target.userKey),
		UserAccountId:      stringPointer(target.userAccountID),
		RecordKind:         stringPointer(ai.CanonicalActivityRecordKind),
		SourceType:         stringPointer(aiSourceOtel),
		SourceConnectionId: soleConnectionID(connections),
		SourceUpdatedAt:    timePointer(updatedAt),
	}
	if err := tx.CreateOrUpdate(activity); err != nil {
		return fmt.Errorf("write canonical Claude activity: %w", err)
	}
	return nil
}

func writeCanonicalModelUsage(tx dal.Transaction, target dailyTarget, accountID, email string, rows []*models.OtelHourlyModelUsage) error {
	totals := make(map[string]*ai.AiModelUsage)
	connections := make(map[string]map[uint64]struct{})
	for _, row := range rows {
		usage := totals[row.Model]
		if usage == nil {
			usage = &ai.AiModelUsage{
				DomainEntity: domainlayer.NewDomainEntity(ai.CanonicalModelUsageID(aiProviderClaude, target.workspaceKey, target.userKey, target.date, row.Model)),
				Provider:     aiProviderClaude, WorkspaceKey: target.workspaceKey, AccountId: accountID, UserKey: target.userKey, UserAccountId: target.userAccountID, UserEmail: email, Date: target.date, Model: row.Model,
				EstimatedCostUsd: "0.00000000", SourceType: aiSourceOtel,
			}
			totals[row.Model] = usage
			connections[row.Model] = make(map[uint64]struct{})
		}
		usage.InputTokens += row.InputTokens
		usage.OutputTokens += row.OutputTokens
		usage.CacheReadTokens += row.CacheReadTokens
		usage.CacheCreationTokens += row.CacheCreationTokens
		usage.EstimatedCostUsd = addDecimal(usage.EstimatedCostUsd, row.EstimatedCostUSD, 8)
		usage.SourceUpdatedAt = latestTime(usage.SourceUpdatedAt, row.LastObservedAt)
		connections[row.Model][row.ConnectionId] = struct{}{}
	}
	for model, usage := range totals {
		usage.SourceConnectionId = soleConnectionID(connections[model])
		if err := tx.CreateOrUpdate(usage); err != nil {
			return fmt.Errorf("write canonical Claude model usage: %w", err)
		}
	}
	return nil
}

func writeCanonicalToolDecisions(tx dal.Transaction, target dailyTarget, accountID, email string, rows []*models.OtelHourlyToolUsage) error {
	totals := make(map[string]*ai.AiToolDecision)
	connections := make(map[string]map[uint64]struct{})
	for _, row := range rows {
		decision := totals[row.ToolName]
		if decision == nil {
			decision = &ai.AiToolDecision{
				DomainEntity: domainlayer.NewDomainEntity(ai.CanonicalToolDecisionID(aiProviderClaude, target.workspaceKey, target.userKey, target.date, row.ToolName)),
				Provider:     aiProviderClaude, WorkspaceKey: target.workspaceKey, AccountId: accountID, UserKey: target.userKey, UserAccountId: target.userAccountID, UserEmail: email, Date: target.date, ToolName: row.ToolName, SourceType: aiSourceOtel,
			}
			totals[row.ToolName] = decision
			connections[row.ToolName] = make(map[uint64]struct{})
		}
		decision.AcceptedCount += row.AcceptedCount
		decision.RejectedCount += row.RejectedCount
		decision.SourceUpdatedAt = latestTime(decision.SourceUpdatedAt, row.LastObservedAt)
		connections[row.ToolName][row.ConnectionId] = struct{}{}
	}
	for tool, decision := range totals {
		decision.SourceConnectionId = soleConnectionID(connections[tool])
		if err := tx.CreateOrUpdate(decision); err != nil {
			return fmt.Errorf("write canonical Claude tool decisions: %w", err)
		}
	}
	return nil
}

func addDecimal(left, right string, scale int) string {
	l, lok := new(big.Rat).SetString(left)
	r, rok := new(big.Rat).SetString(right)
	if !lok || !rok {
		return left
	}
	return new(big.Rat).Add(l, r).FloatString(scale)
}

func latestTime(current, candidate time.Time) time.Time {
	if candidate.After(current) {
		return candidate
	}
	return current
}

func soleConnectionID(connections map[uint64]struct{}) *uint64 {
	if len(connections) != 1 {
		return nil
	}
	for connectionID := range connections {
		return &connectionID
	}
	return nil
}

func stringPointer(value string) *string { return &value }

func timePointer(value time.Time) *time.Time {
	if value.IsZero() {
		return nil
	}
	return &value
}
