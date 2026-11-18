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

package repositories

import (
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
)

// AIProviderRow is one provider's daily activity summed over the days.
type AIProviderRow struct {
	Provider     string
	ActiveDays   int64
	Sessions     int64
	Suggestions  int64
	Acceptances  int64
	LinesAdded   int64
	LinesRemoved int64
	CommitsByAI  int64 `gorm:"column:commits_by_ai"`
	PullRequests int64
}

// AIToolDecisionCounts sums the tool decisions an engineer made.
type AIToolDecisionCounts struct {
	ToolEditsAccepted, ToolEditsRejected int64
}

// AIMonthlyRow is one provider's activity in one UTC month, formatted YYYY-MM.
type AIMonthlyRow struct {
	Provider    string
	Month       string
	ActiveDays  int64
	Sessions    int64
	Suggestions int64
	Acceptances int64
}

// AIModelCostRow is the token use and cost of one model. The cost is a decimal string in US dollars.
type AIModelCostRow struct {
	Provider            string
	Model               string
	InputTokens         int64
	OutputTokens        int64
	CacheReadTokens     int64
	CacheCreationTokens int64
	EstimatedCostUSD    string `gorm:"column:estimated_cost_usd"`
}

// AIMonthlyCostRow is the token use and cost of one UTC month. The cost is a decimal string in US dollars.
type AIMonthlyCostRow struct {
	Month        string
	InputTokens  int64
	OutputTokens int64
	CostUSD      string `gorm:"column:cost_usd"`
}

// aiCostRows is the per-model union both cost queries read: Claude from model usage records, and every other
// provider from daily activity, which is where Cursor reports cost. Claude activity rows carry no cost, so
// skipping them avoids counting anything twice. Costs are summed as DECIMAL so no float rounding reaches the API.
const aiCostRows = `(
	SELECT provider, model, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
		SUM(cache_read_tokens) AS cache_read_tokens, SUM(cache_creation_tokens) AS cache_creation_tokens,
		SUM(estimated_cost_usd) AS cost
	FROM ai_model_usages WHERE LOWER(user_email) = ? AND date >= ? AND date <= ? GROUP BY provider, model
	UNION ALL
	SELECT provider, model, SUM(input_tokens), SUM(output_tokens), 0, 0, SUM(CAST(estimated_cost_usd AS DECIMAL(20,8)))
	FROM ai_activities WHERE provider <> 'claude' AND LOWER(user_email) = ? AND date >= ? AND date <= ? GROUP BY provider, model
) costs`

// aiMonthlyCostRows is aiCostRows per UTC month instead of per model.
const aiMonthlyCostRows = `(
	SELECT DATE_FORMAT(date, '%Y-%m') AS month, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
		SUM(estimated_cost_usd) AS cost
	FROM ai_model_usages WHERE LOWER(user_email) = ? AND date >= ? AND date <= ? GROUP BY month
	UNION ALL
	SELECT DATE_FORMAT(date, '%Y-%m'), SUM(input_tokens), SUM(output_tokens), SUM(CAST(estimated_cost_usd AS DECIMAL(20,8)))
	FROM ai_activities WHERE provider <> 'claude' AND LOWER(user_email) = ? AND date >= ? AND date <= ? GROUP BY DATE_FORMAT(date, '%Y-%m')
) costs`

// AI reads AI activity and cost from the daily domain tables. Every method takes an inclusive range of
// days, formatted YYYY-MM-DD. It is safe for concurrent use.
type AI struct {
	db rowsReader
}

// NewAI returns a repository that reads through db, which must not be nil.
func NewAI(db rowsReader) (*AI, errors.Error) {
	if db == nil {
		return nil, errors.Default.New("ai repository: nil db")
	}
	return &AI{db: db}, nil
}

// Providers lists email's activity per provider over the days, sorted by provider.
func (r *AI) Providers(email, firstDay, lastDay string) ([]AIProviderRow, errors.Error) {
	var rows []AIProviderRow
	if err := r.db.All(&rows,
		dal.Select(`provider, COUNT(DISTINCT date) AS active_days, COALESCE(SUM(num_sessions), 0) AS sessions,
			COALESCE(SUM(suggestions_count), 0) AS suggestions, COALESCE(SUM(acceptance_count), 0) AS acceptances,
			COALESCE(SUM(lines_added), 0) AS lines_added, COALESCE(SUM(lines_removed), 0) AS lines_removed,
			COALESCE(SUM(commits_created), 0) AS commits_by_ai, COALESCE(SUM(prs_created), 0) AS pull_requests`),
		dal.From("ai_activities"),
		dal.Where("LOWER(user_email) = ? AND date >= ? AND date <= ?", email, firstDay, lastDay),
		dal.Groupby("provider"),
		dal.Orderby("provider"),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read ai activities")
	}
	return rows, nil
}

// ToolDecisions sums email's accepted and rejected file edits and writes over the days.
func (r *AI) ToolDecisions(email, firstDay, lastDay string) (AIToolDecisionCounts, errors.Error) {
	var rows []AIToolDecisionCounts
	if err := r.db.All(&rows,
		dal.Select("COALESCE(SUM(accepted_count), 0) AS tool_edits_accepted, COALESCE(SUM(rejected_count), 0) AS tool_edits_rejected"),
		dal.From("ai_tool_decisions"),
		dal.Where("LOWER(user_email) = ? AND date >= ? AND date <= ?", email, firstDay, lastDay),
	); err != nil {
		return AIToolDecisionCounts{}, errors.Default.Wrap(err, "read ai tool decisions")
	}
	return singleRow(rows), nil
}

// Monthly lists email's activity per provider and UTC month over the days, oldest month first.
func (r *AI) Monthly(email, firstDay, lastDay string) ([]AIMonthlyRow, errors.Error) {
	var rows []AIMonthlyRow
	if err := r.db.All(&rows,
		dal.Select(`provider, DATE_FORMAT(date, '%Y-%m') AS month, COUNT(DISTINCT date) AS active_days,
			COALESCE(SUM(num_sessions), 0) AS sessions, COALESCE(SUM(suggestions_count), 0) AS suggestions,
			COALESCE(SUM(acceptance_count), 0) AS acceptances`),
		dal.From("ai_activities"),
		dal.Where("LOWER(user_email) = ? AND date >= ? AND date <= ?", email, firstDay, lastDay),
		dal.Groupby("provider, month"),
		dal.Orderby("month, provider"),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read ai monthly activity")
	}
	return rows, nil
}

// ModelCosts lists email's token use and cost per provider and model over the days, sorted.
func (r *AI) ModelCosts(email, firstDay, lastDay string) ([]AIModelCostRow, errors.Error) {
	var rows []AIModelCostRow
	if err := r.db.All(&rows,
		dal.Select(`provider, model, COALESCE(SUM(input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens,
			COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens, COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
			CAST(CAST(COALESCE(SUM(cost), 0) AS DECIMAL(20,8)) AS CHAR) AS estimated_cost_usd`),
		dal.From(aiCostRows, costParams(email, firstDay, lastDay)...),
		dal.Groupby("provider, model"),
		dal.Orderby("provider, model"),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read ai model costs")
	}
	return rows, nil
}

// TotalCost sums email's cost over the days as a decimal string in US dollars, or "" when the query reads no row.
func (r *AI) TotalCost(email, firstDay, lastDay string) (string, errors.Error) {
	var rows []struct{ TotalEstimatedCostUsd string }
	if err := r.db.All(&rows,
		dal.Select("CAST(CAST(COALESCE(SUM(cost), 0) AS DECIMAL(20,8)) AS CHAR) AS total_estimated_cost_usd"),
		dal.From(aiCostRows, costParams(email, firstDay, lastDay)...),
	); err != nil {
		return "", errors.Default.Wrap(err, "read ai total cost")
	}
	return singleRow(rows).TotalEstimatedCostUsd, nil
}

// MonthlyCosts lists email's token use and cost per UTC month over the days, oldest first.
func (r *AI) MonthlyCosts(email, firstDay, lastDay string) ([]AIMonthlyCostRow, errors.Error) {
	var rows []AIMonthlyCostRow
	if err := r.db.All(&rows,
		dal.Select(`month, COALESCE(SUM(input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens,
			CAST(CAST(COALESCE(SUM(cost), 0) AS DECIMAL(20,8)) AS CHAR) AS cost_usd`),
		dal.From(aiMonthlyCostRows, costParams(email, firstDay, lastDay)...),
		dal.Groupby("month"),
		dal.Orderby("month"),
	); err != nil {
		return nil, errors.Default.Wrap(err, "read ai monthly costs")
	}
	return rows, nil
}

// costParams binds the two halves of the cost unions.
func costParams(email, firstDay, lastDay string) []interface{} {
	return []interface{}{email, firstDay, lastDay, email, firstDay, lastDay}
}
