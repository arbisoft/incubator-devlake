SELECT $__timeGroup(cdc.finished_date, $interval)   AS time,
       COUNT(DISTINCT cdc.cicd_deployment_id)  AS deployments
FROM cicd_deployment_commits cdc
WHERE cdc.id like 'github:%' 
  AND cdc.environment = 'PRODUCTION'
  AND cdc.result      = 'SUCCESS'
  AND $__timeFilter(cdc.finished_date)
  AND cdc.repo_id IN ( ${repo_id} )
  AND EXISTS (SELECT 1 FROM project_mapping pm
                WHERE pm.row_id = cdc.repo_id
                  AND pm.`table` = 'repos'
                  AND pm.project_name IN ( ${project} ))
GROUP BY time
ORDER BY time;