WITH first_touch AS (
  SELECT pr.id,
         pr.created_date,
         MIN(c.created_date) AS first_response
  FROM pull_requests pr
  JOIN pull_request_comments c
    ON c.pull_request_id = pr.id
   AND NOT (c.account_id <=> pr.author_id)     
   AND c.created_date >= pr.created_date
  WHERE pr.id LIKE 'github:%'
    AND $__timeFilter(pr.created_date)
    AND pr.base_repo_id IN ( ${repo_id} )
    AND EXISTS (SELECT 1 FROM project_mapping pm
                 WHERE pm.row_id = pr.base_repo_id
                   AND pm.`table` = 'repos'
                   AND pm.project_name IN ( ${project} ))
    AND pr.author_id IN ( $developer_id )
  GROUP BY pr.id, pr.created_date
),
d AS (
  SELECT $__timeGroup(created_date, ${interval})                              AS bucket,
         TIMESTAMPDIFF(MINUTE, created_date, first_response) / 60.0    AS hours
  FROM first_touch
),
ranked AS (
  SELECT bucket, hours,
         CUME_DIST() OVER (PARTITION BY bucket ORDER BY hours) AS cd
  FROM d
)
SELECT bucket                                               AS time,
       ROUND(MIN(CASE WHEN cd >= 0.50 THEN hours END), 2)   AS Median,
       ROUND(MIN(CASE WHEN cd >= 0.90 THEN hours END), 2)   AS P90
FROM ranked
GROUP BY bucket
ORDER BY bucket;