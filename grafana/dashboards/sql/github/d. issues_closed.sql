-- Time series counting DONE issues per assignee, bucketed by resolution date.
SELECT $__timeGroup(i.resolution_date, ${interval})                     AS time,
       REPLACE(COALESCE(
         NULLIF(TRIM(a.full_name),     ''),
         NULLIF(TRIM(a.user_name),     ''),
         NULLIF(TRIM(i.assignee_name), ''),
         '(unassigned)'
       ), '-', ' ')                                              AS metric,
       COUNT(*)                                                  AS value
FROM issues i
JOIN accounts a ON a.id = i.assignee_id AND a.email IN ( $developer_id )
WHERE i.status = 'DONE'
  AND i.resolution_date IS NOT NULL
  AND i.id LIKE 'github:%'
  AND $__timeFilter(i.resolution_date)
GROUP BY time, metric
ORDER BY time;