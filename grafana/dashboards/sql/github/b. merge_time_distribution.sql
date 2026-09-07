-- Buckets merged PRs by created-to-merged elapsed time into five ranges, reporting PR count and share of total.
SELECT CASE
         WHEN mins <    240 THEN '1. under 4h'
         WHEN mins <   1440 THEN '2. 4-24h'
         WHEN mins <   4320 THEN '3. 1-3d'
         WHEN mins <  10080 THEN '4. 3-7d'
         ELSE                    '5. over 7d'
       END                                                   AS Bucket,
       COUNT(*)                                              AS `PR Count`,
       CONCAT(ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1), '%')    AS Percentage
FROM (
  SELECT TIMESTAMPDIFF(MINUTE, pr.created_date, pr.merged_date) AS mins
  FROM pull_requests pr
  JOIN accounts a ON a.id = pr.author_id AND a.email IN ( $developer_id )
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
) d
GROUP BY bucket
ORDER BY bucket;