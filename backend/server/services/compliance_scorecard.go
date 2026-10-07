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

// complianceScorecardSql is run against the DevLake database, the same one
// Grafana's "mysql" datasource reads from. Its output columns must stay in
// the same order as the fields of ComplianceScorecardRow.
// project_mapping.table is a reserved word, so it is quoted with backticks,
// which a Go raw string cannot contain; hence the concatenation.
const complianceScorecardSql = `
WITH source_names (code, label) AS (
    SELECT 'jira',           'Jira'            UNION ALL
    SELECT 'github',         'GitHub'          UNION ALL
    SELECT 'gitlab',         'GitLab'          UNION ALL
    SELECT 'bitbucket',      'Bitbucket'       UNION ALL
    SELECT 'bitbucket_server','Bitbucket Server' UNION ALL
    SELECT 'azuredevops',    'Azure DevOps'    UNION ALL
    SELECT 'azuredevops_go', 'Azure DevOps'    UNION ALL
    SELECT 'gitee',          'Gitee'           UNION ALL
    SELECT 'tapd',           'TAPD'            UNION ALL
    SELECT 'zentao',         'ZenTao'          UNION ALL
    SELECT 'teambition',     'Teambition'      UNION ALL
    SELECT 'trello',         'Trello'          UNION ALL
    SELECT 'asana',          'Asana'           UNION ALL
    SELECT 'plane',          'Plane'           UNION ALL
    SELECT 'taiga',          'Taiga'           UNION ALL
    SELECT 'claude',         'Claude'          UNION ALL
    SELECT 'claude (otel)',  'Claude Code (OTel)' UNION ALL
    SELECT 'gh-copilot',     'GitHub Copilot'  UNION ALL
    SELECT 'cursor',         'Cursor'          UNION ALL
    SELECT 'codex',          'Codex'
),-- Issue sources: boards that actually have issues; source = plugin prefix of the board id
issue_sources AS (
    SELECT DISTINCT pm.project_name, SUBSTRING_INDEX(pm.row_id, ':', 1) AS code
    FROM project_mapping pm
    WHERE pm.table = 'boards'
      AND EXISTS (SELECT 1 FROM board_issues bi WHERE bi.board_id = pm.row_id)
),-- PR sources: repos that actually have PRs
pr_sources AS (
    SELECT DISTINCT pm.project_name, SUBSTRING_INDEX(pm.row_id, ':', 1) AS code
    FROM project_mapping pm
    WHERE pm.table = 'repos'
      AND EXISTS (SELECT 1 FROM pull_requests pr WHERE pr.base_repo_id = pm.row_id)
),
ai_rows AS (
    SELECT DISTINCT
        provider,
        source_type,
        source_connection_id,
        CASE WHEN JSON_VALID(_raw_data_params) THEN COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(_raw_data_params, '$.connectionId')),
            JSON_UNQUOTE(JSON_EXTRACT(_raw_data_params, '$.ConnectionId'))) END AS conn_id,
        CASE WHEN JSON_VALID(_raw_data_params) THEN COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(_raw_data_params, '$.scopeId')),
            JSON_UNQUOTE(JSON_EXTRACT(_raw_data_params, '$.ScopeId'))) END AS scope_id
    FROM ai_activities
),
ai_sources AS ( 
    SELECT cp.project_name, 'claude (otel)' AS code
    FROM ai_rows s
    JOIN _tool_claude_code_otel_connection_projects cp ON cp.connection_id = s.source_connection_id
    WHERE s.source_type = 'otel'
    UNION 
    SELECT b.project_name, s.provider
    FROM ai_rows s
    JOIN _devlake_blueprint_scopes bs
      ON bs.plugin_name = s.provider
     AND bs.connection_id = s.conn_id
     AND bs.scope_id = s.scope_id
    JOIN _devlake_blueprints b ON b.id = bs.blueprint_id
    WHERE COALESCE(s.source_type, '') <> 'otel'
),
labelled AS (
    SELECT 'issue' AS kind, x.project_name, COALESCE(n.label, x.code) AS label
    FROM issue_sources x LEFT JOIN source_names n ON n.code = x.code
    UNION ALL
    SELECT 'pr', x.project_name, COALESCE(n.label, x.code)
    FROM pr_sources x LEFT JOIN source_names n ON n.code = x.code
    UNION ALL
    SELECT 'ai', x.project_name, COALESCE(n.label, x.code)
    FROM ai_sources x LEFT JOIN source_names n ON n.code = x.code
),
by_project AS (
    SELECT project_name,
        GROUP_CONCAT(DISTINCT CASE WHEN kind = 'issue' THEN label END ORDER BY label SEPARATOR ', ') AS issue_src,
        GROUP_CONCAT(DISTINCT CASE WHEN kind = 'pr'    THEN label END ORDER BY label SEPARATOR ', ') AS pr_src,
        GROUP_CONCAT(DISTINCT CASE WHEN kind = 'ai'    THEN label END ORDER BY label SEPARATOR ', ') AS ai_src
    FROM labelled
    GROUP BY project_name
),
the_results AS (
	SELECT p.name AS project,
	    COALESCE(CONCAT('✅ ', bp.issue_src), '❌ Not available') AS issue_visibility,
	    COALESCE(CONCAT('✅ ', bp.pr_src),    '❌ Not available') AS pr_visibility,
	    COALESCE(CONCAT('✅ ', bp.ai_src),    '❌ Not available') AS ai_visibility,
	    (bp.issue_src IS NOT NULL) +
	        (bp.pr_src    IS NOT NULL) +
	        (bp.ai_src    IS NOT NULL) AS Score
	FROM projects p
	LEFT JOIN by_project bp ON bp.project_name = p.name
)
SELECT project, issue_visibility, pr_visibility, ai_visibility,
	CASE
		WHEN Score = 0 THEN '🚨 00.0%'
		WHEN Score = 1 THEN '🔶 33.3%'
		WHEN Score = 2 THEN '⚠️ 66.6%'
		ELSE '✅ 100%'
	END AS compliance
FROM the_results tr
ORDER BY project
`

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
