SELECT $__timeGroup(cdc.finished_date, $interval)   AS time,
       COUNT(DISTINCT cdc.cicd_deployment_id)  AS deployments
FROM cicd_deployment_commits cdc
WHERE cdc.id like 'github:%' 
  AND cdc.environment = 'PRODUCTION'
  AND cdc.result      = 'SUCCESS'
  AND $__timeFilter(cdc.finished_date)
GROUP BY time
ORDER BY time;