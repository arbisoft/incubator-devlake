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
	_ "embed"

	"github.com/apache/incubator-devlake/core/errors"
)

// ComplianceScorecardRow is one project's row in the compliance scorecard
type ComplianceScorecardRow struct {
	Project         string `json:"Project"`
	IssueVisibility string `json:"Issue Visibility"`
	PrVisibility    string `json:"PR Visibility"`
	AiVisibility    string `json:"AI Visibility"`
	Compliance      string `json:"Compliance"`
}

// Output columns must stay in the order of ComplianceScorecardRow's fields.
//
//go:embed compliance_scorecard.sql
var complianceScorecardSql string

// GetComplianceScorecard runs the compliance scorecard query and returns one
// row per project
func GetComplianceScorecard() ([]ComplianceScorecardRow, errors.Error) {
	rows, err := db.RawCursor(complianceScorecardSql)
	if err != nil {
		return nil, errors.Default.Wrap(err, "error querying compliance scorecard")
	}
	defer rows.Close()

	result := make([]ComplianceScorecardRow, 0)
	for rows.Next() {
		var row ComplianceScorecardRow
		scanErr := rows.Scan(
			&row.Project,
			&row.IssueVisibility,
			&row.PrVisibility,
			&row.AiVisibility,
			&row.Compliance,
		)
		if scanErr != nil {
			return nil, errors.Default.Wrap(scanErr, "error scanning compliance scorecard row")
		}
		result = append(result, row)
	}
	if scanErr := rows.Err(); scanErr != nil {
		return nil, errors.Default.Wrap(scanErr, "error iterating compliance scorecard rows")
	}
	return result, nil
}
