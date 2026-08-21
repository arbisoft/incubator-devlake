WITH deploys AS (
  SELECT cicd_deployment_id AS id,
         MIN(finished_date)  AS ts
  FROM cicd_deployment_commits
  WHERE id LIKE 'github:%' 
    AND environment = 'PRODUCTION'
    AND result      = 'SUCCESS'
    AND $__timeFilter(finished_date)
    AND repo_id IN ( ${repo_id} )
    AND EXISTS (SELECT 1 FROM project_mapping pm
                WHERE pm.row_id = repo_id
                  AND pm.`table` = 'repos'
                  AND pm.project_name IN ( ${project} ))
  GROUP BY cicd_deployment_id
),
deploy_repos AS (
  SELECT DISTINCT cicd_deployment_id AS id, repo_id
  FROM cicd_deployment_commits
  WHERE id LIKE 'github:%' 
    AND environment = 'PRODUCTION'
    AND result      = 'SUCCESS'
    AND $__timeFilter(finished_date)
    AND repo_id IN ( ${repo_id} )
    AND EXISTS (SELECT 1 FROM project_mapping pm
                WHERE pm.row_id = repo_id
                  AND pm.`table` = 'repos'
                  AND pm.project_name IN ( ${project} ))
),
reverts AS (
  SELECT pr.base_repo_id AS repo_id,
         pr.merged_date  AS ts
  FROM pull_requests pr
  WHERE id LIKE 'github:%' 
    AND pr.status = 'MERGED'
    AND pr.merged_date IS NOT NULL
    AND (pr.title    LIKE 'Revert %'
      OR pr.head_ref LIKE 'revert-%'
      OR pr.head_ref LIKE 'rollback/%')
    AND $__timeFilter(pr.created_date)
    AND pr.base_repo_id IN ( ${repo_id} )
    AND EXISTS (SELECT 1 FROM project_mapping pm
            WHERE pm.row_id = pr.base_repo_id
              AND pm.`table` = 'repos'
              AND pm.project_name IN ( ${project} ))
),
paired AS (
  SELECT d.id,
         d.ts                                                  AS deployed_at,
         MIN(r.ts)                                             AS rolled_back_at
  FROM deploys d
  JOIN deploy_repos dr ON dr.id = d.id
  JOIN reverts r
    ON r.repo_id = dr.repo_id
   AND r.ts >  d.ts
   AND r.ts <= d.ts + INTERVAL 7 DAY
  GROUP BY d.id, d.ts
),
d AS (
  SELECT $__timeGroup(deployed_at, $interval)                                AS bucket,
         TIMESTAMPDIFF(MINUTE, deployed_at, rolled_back_at) / 60.0      AS hours
  FROM paired
),
ranked AS (
  SELECT bucket, hours,
         PERCENT_RANK() OVER (PARTITION BY bucket ORDER BY hours) AS pct
  FROM d
)
SELECT bucket                                              AS time,
       COUNT(*)                                            AS Rollbacks,
       COALESCE(ROUND(MAX(CASE WHEN pct <= 0.50 THEN hours END), 1), 0) AS Median,
       COALESCE(ROUND(MAX(CASE WHEN pct > 0.51 AND pct <= 0.90 THEN hours END), 1), 0) AS `P90`
FROM ranked
GROUP BY bucket
ORDER BY bucket;