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
-- repo-scoped failure signals: reverts and hotfixes
repo_failures AS (
  SELECT pr.base_repo_id AS repo_id,
         pr.merged_date  AS ts
  FROM pull_requests pr
  WHERE pr.id LIKE 'github:%' 
    AND pr.status = 'MERGED'
    AND pr.merged_date IS NOT NULL
    AND (pr.title    LIKE 'Revert %'
      OR pr.head_ref LIKE 'hotfix/%'
      OR pr.head_ref LIKE 'revert-%')
    AND pr.base_repo_id IN ( ${repo_id} )
    AND EXISTS (SELECT 1 FROM project_mapping pm
                  WHERE pm.row_id = pr.base_repo_id
                    AND pm.`table` = 'repos'
                    AND pm.project_name IN ( ${project} ))  
),
failed AS (
  SELECT DISTINCT d.id
  FROM deploys d
  JOIN deploy_repos dr ON dr.id = d.id
  JOIN repo_failures f
    ON f.repo_id = dr.repo_id
   AND f.ts >  d.ts
   AND f.ts <= d.ts + INTERVAL 24 HOUR
  UNION
  -- incidents have no repo link, so attribute by time only
  SELECT DISTINCT d.id
  FROM deploys d
  JOIN incidents inc
    ON inc.created_date >  d.ts
   AND inc.created_date <= d.ts + INTERVAL 24 HOUR
)
SELECT $__timeGroup(d.ts, $interval)                          AS time,
       COUNT(*)                                          AS Deployments,
       COUNT(fa.id)                                      AS `Failed Deployments`,
       ROUND(100.0 * COUNT(fa.id) / COUNT(*), 1)         AS `Change/Failure Rate`
FROM deploys d
LEFT JOIN failed fa ON fa.id = d.id
GROUP BY time
ORDER BY time;