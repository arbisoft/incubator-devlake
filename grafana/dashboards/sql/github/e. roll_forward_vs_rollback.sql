WITH deploys AS (
  SELECT cicd_deployment_id AS id, MIN(finished_date) AS ts
  FROM cicd_deployment_commits
  WHERE id LIKE 'github:%'
    AND environment = 'PRODUCTION' AND result = 'SUCCESS'
    AND $__timeFilter(finished_date)
  GROUP BY cicd_deployment_id
),
deploy_repos AS (
  SELECT DISTINCT cicd_deployment_id AS id, repo_id
  FROM cicd_deployment_commits
  WHERE id LIKE 'github:%'
    AND environment = 'PRODUCTION' AND result = 'SUCCESS'
    AND $__timeFilter(finished_date)
),
signals AS (
  SELECT pr.base_repo_id AS repo_id, pr.merged_date AS ts, 'rollback' AS kind
  FROM pull_requests pr
  WHERE pr.status = 'MERGED' AND pr.merged_date IS NOT NULL
    AND (pr.title LIKE 'Revert %' OR pr.head_ref LIKE 'revert-%'
      OR pr.head_ref LIKE 'rollback/%')
  UNION ALL
  SELECT pr.base_repo_id, pr.merged_date, 'forward'
  FROM pull_requests pr
  WHERE id LIKE 'github:%'
    AND pr.status = 'MERGED' AND pr.merged_date IS NOT NULL
    AND (pr.head_ref LIKE 'hotfix/%' OR pr.title LIKE '%hotfix%'
      OR pr.title LIKE '%fix forward%')
),
remedied AS (
  SELECT d.id,
         d.ts AS deployed_at,
         SUBSTRING_INDEX(
           GROUP_CONCAT(s.kind ORDER BY s.ts SEPARATOR ','), ',', 1) AS remedy
  FROM deploys d
  JOIN deploy_repos dr ON dr.id = d.id
  JOIN signals s
    ON s.repo_id = dr.repo_id
   AND s.ts >  d.ts
   AND s.ts <= d.ts + INTERVAL 24 HOUR
  GROUP BY d.id, d.ts
)
SELECT $__timeGroup(deployed_at, $interval)                              AS time,
       SUM(remedy = 'rollback')                                     AS `Rollback`,
       SUM(remedy = 'forward')                                      AS `Fixed Forward`,
       COUNT(*)                                                     AS `Failed Deployments`,
       ROUND(100.0 * SUM(remedy = 'rollback') / COUNT(*), 1)        AS `Rollback%`
FROM remedied
GROUP BY time
ORDER BY time;