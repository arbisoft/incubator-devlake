-- Per time bucket, the share of successful production deployments followed within 24h by a revert PR or by a deployment named rollback/revert.
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
  WHERE pr.status = 'MERGED'
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
rolled_back AS (
  -- a revert merged in one of the deployment's repos, shortly after it shipped
  SELECT DISTINCT d.id
  FROM deploys d
  JOIN deploy_repos dr ON dr.id = d.id
  JOIN reverts r
    ON r.repo_id = dr.repo_id
   AND r.ts >  d.ts
   AND r.ts <= d.ts + INTERVAL 24 HOUR
  UNION
  -- a deployment the CI system itself named as a rollback, shortly after
  SELECT DISTINCT d.id
  FROM deploys d
  JOIN cicd_deployment_commits rb
    ON rb.environment  = 'PRODUCTION'
   AND rb.finished_date >  d.ts
   AND rb.finished_date <= d.ts + INTERVAL 24 HOUR
   AND (rb.name LIKE '%rollback%' OR rb.name LIKE '%revert%')
)
SELECT $__timeGroup(d.ts, $interval)                    AS time,
       COUNT(*)                                    AS Deployments,
       COUNT(rb.id)                                AS `Rolled Back`,
       ROUND(100.0 * COUNT(rb.id) / COUNT(*), 1)   AS `Rollback%`
FROM deploys d
LEFT JOIN rolled_back rb ON rb.id = d.id
GROUP BY time
ORDER BY time;