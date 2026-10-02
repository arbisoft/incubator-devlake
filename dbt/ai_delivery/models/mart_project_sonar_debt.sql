{{ config(materialized='table') }}

-- One row per project — the REAL technical-debt snapshot from SonarQube.
--
-- cq_file_metrics carries the per-file SonarQube results; sqale_index is the
-- literal technical-debt estimate (minutes of remediation effort). DevLake stores
-- only the latest analysis (no history), so this is a point-in-time snapshot, not a
-- time series — the weekly trend lives in mart_project_debt (churn proxy). Both are
-- shown side by side, each labeled by source, so the "real vs proxy" distinction is
-- never blurred.
--
-- Sonar project -> DevLake project: cq_file_metrics.project_key = cq_projects.id,
-- and cq_projects is mapped as a project_mapping row with table='cq_projects'.
-- If SonarQube is not connected this mart is simply empty, and the tech-debt panel
-- falls back to the churn proxy — no error, no blocking.

WITH sonar_project AS (
    SELECT cp.id            AS cq_project_id,
           pm.project_name  AS project_name,
           cp.last_analysis_date
    FROM {{ source('devlake', 'cq_projects') }} cp
    JOIN {{ source('devlake', 'project_mapping') }} pm
      ON pm.row_id = cp.id
     AND pm.`table` = 'cq_projects'
)

SELECT sp.project_name                     AS project_name,
       'sonar'                             AS debt_source,
       SUM(m.sqale_index)                  AS sqale_index_minutes,
       ROUND(SUM(m.sqale_index) / 60.0, 1) AS sqale_index_hours,
       SUM(m.code_smells)                  AS code_smells,
       SUM(m.bugs)                         AS sonar_bugs,
       MAX(m.reliability_rating)           AS worst_reliability_rating,
       COUNT(*)                            AS files_analyzed,
       MAX(sp.last_analysis_date)          AS last_analysis_date
FROM sonar_project sp
JOIN {{ source('devlake', 'cq_file_metrics') }} m
  ON m.project_key = sp.cq_project_id
GROUP BY sp.project_name
