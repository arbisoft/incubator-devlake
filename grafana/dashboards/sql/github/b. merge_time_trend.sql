WITH d AS (
  SELECT $__timeGroup(pr.merged_date, $interval)                              AS bucket,
         TIMESTAMPDIFF(MINUTE, pr.created_date, pr.merged_date) / 1440.0 AS days
  FROM pull_requests pr
  WHERE pr.status      = 'MERGED'
    AND pr.merged_date IS NOT NULL
    AND pr.merged_date > pr.created_date
    AND pr.id LIKE 'github:%'
    AND $__timeFilter(pr.merged_date)
    AND pr.base_repo_id IN ( ${repo_id} )
    AND EXISTS (SELECT 1 FROM project_mapping pm
                 WHERE pm.row_id = pr.base_repo_id
                   AND pm.`table` = 'repos'
                   AND pm.project_name IN ( ${project} ))
),
ranked AS (
  SELECT bucket, days,
         PERCENT_RANK() OVER (PARTITION BY bucket ORDER BY days) AS pct
  FROM d
)
SELECT bucket                                              AS time,
       ROUND(MAX(CASE WHEN pct <= 0.50 THEN days END), 2)  AS Median,
       ROUND(MAX(CASE WHEN pct <= 0.75 THEN days END), 2)  AS P75,
       ROUND(MAX(CASE WHEN pct <= 0.90 THEN days END), 2)  AS P90
FROM ranked
GROUP BY bucket
ORDER BY bucket;