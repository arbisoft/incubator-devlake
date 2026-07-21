{{ config(materialized='table') }}

-- One row per (project, AI person) — the membership map.
--
-- A project "member" is an AI user who authored a pull request in one of that
-- project's repos. This is the membership scope the dashboard's project panels
-- use: AI usage is person-level and only attributed to a project through PR
-- authorship, never split across projects. A person active on several projects
-- appears once per project (full usage in each) — that is intentional.
--
-- References mart_ai_person_accounts so identity resolution is not repeated here
-- and dbt runs the two models in dependency order.

SELECT DISTINCT
       pm.project_name AS project_name,
       pa.email        AS email
FROM {{ ref('mart_ai_person_accounts') }} pa
JOIN {{ source('devlake', 'pull_requests') }} pr
  ON pr.author_id = pa.account_id
JOIN {{ source('devlake', 'project_mapping') }} pm
  ON pm.row_id = pr.base_repo_id
 AND pm.`table` = 'repos'
