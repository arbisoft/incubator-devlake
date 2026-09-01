{{ config(materialized='table') }}

-- One row per (project, week) — bug volume logged against each project's boards.
--
-- A "bug" is any issue whose standardized type is BUG or INCIDENT. This reads the
-- DEVLAKE DOMAIN LAYER (issues / board_issues / project_mapping), not any one
-- plugin's tables, so it works for EVERY issue tracker DevLake supports — Jira,
-- GitHub Issues, GitLab, TAPD, Zentao, PagerDuty, etc. — with no change: each
-- plugin maps its own raw types to the standard BUG/INCIDENT enum. Issues reach a
-- project through their board: issues -> board_issues -> project_mapping(table='boards').
-- This is the issue-tracker-side twin of mart_ai_project_members' repo-side
-- membership, and like it, carries no AI attribution — it is only the
-- denominator/context the dashboard correlates AI-usage intensity against.
--
-- Two week grains are emitted per the design (bugs opened AND resolved), so a
-- single (project, week) row shows both introduction and fix throughput. Week is
-- Monday-start (DATE_SUB(DATE(x), INTERVAL WEEKDAY(x) DAY)), matching every other
-- weekly panel in the dashboard.

WITH board_project AS (
    -- Board -> project. "board" is the generic domain container for an issue
    -- collection (a Jira board, a GitHub repo's issues, a GitLab project, etc.),
    -- mapped as a project_mapping row with table='boards'.
    SELECT bi.issue_id      AS issue_id,
           pm.project_name  AS project_name
    FROM {{ source('devlake', 'board_issues') }} bi
    JOIN {{ source('devlake', 'project_mapping') }} pm
      ON pm.row_id = bi.board_id
     AND pm.`table` = 'boards'
),

bugs AS (
    SELECT bp.project_name,
           i.id                                                            AS issue_id,
           i.priority,
           i.created_date,
           i.resolution_date,
           DATE_SUB(DATE(i.created_date),    INTERVAL WEEKDAY(i.created_date)    DAY) AS opened_week,
           DATE_SUB(DATE(i.resolution_date), INTERVAL WEEKDAY(i.resolution_date) DAY) AS resolved_week
    FROM {{ source('devlake', 'issues') }} i
    JOIN board_project bp ON bp.issue_id = i.id
    WHERE i.type IN ('BUG', 'INCIDENT')
),

-- Bugs bucketed by the week they were opened.
opened AS (
    SELECT project_name,
           opened_week AS week,
           COUNT(*)    AS bugs_opened,
           SUM(CASE WHEN UPPER(priority) IN ('HIGH', 'HIGHEST', 'CRITICAL', 'BLOCKER', 'URGENT')
                    THEN 1 ELSE 0 END) AS bugs_opened_high_sev
    FROM bugs
    WHERE opened_week IS NOT NULL
    GROUP BY project_name, opened_week
),

-- Bugs bucketed by the week they were resolved (resolution_date may be NULL).
resolved AS (
    SELECT project_name,
           resolved_week AS week,
           COUNT(*)      AS bugs_resolved
    FROM bugs
    WHERE resolved_week IS NOT NULL
    GROUP BY project_name, resolved_week
),

weeks AS (
    SELECT project_name, week FROM opened
    UNION
    SELECT project_name, week FROM resolved
)

SELECT w.project_name                       AS project_name,
       w.week                               AS week,
       COALESCE(o.bugs_opened, 0)           AS bugs_opened,
       COALESCE(o.bugs_opened_high_sev, 0)  AS bugs_opened_high_sev,
       COALESCE(r.bugs_resolved, 0)         AS bugs_resolved,
       COALESCE(o.bugs_opened, 0) - COALESCE(r.bugs_resolved, 0) AS net_bug_delta
FROM weeks w
LEFT JOIN opened   o ON o.project_name = w.project_name AND o.week = w.week
LEFT JOIN resolved r ON r.project_name = w.project_name AND r.week = w.week
