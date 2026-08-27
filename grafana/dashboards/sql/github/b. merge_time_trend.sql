-- Per time bucket, derives median/P75/P90 of created-to-merged time in days using CUME_DIST over merged PRs.
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
    AND pr.author_id IN ( $developer_id )
),
ranked AS (
  SELECT bucket, days,
         CUME_DIST() OVER (PARTITION BY bucket ORDER BY days) AS cd
  FROM d
)
SELECT bucket                                              AS time,
       ROUND(MIN(CASE WHEN cd >= 0.50 THEN days END), 2)   AS Median,
       ROUND(MIN(CASE WHEN cd >= 0.75 THEN days END), 2)   AS P75,
       ROUND(MIN(CASE WHEN cd >= 0.90 THEN days END), 2)   AS P90
FROM ranked
GROUP BY bucket
ORDER BY bucket;