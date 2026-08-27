-- Time series counting DONE issues per assignee, bucketed by resolution date.
SELECT $__timeGroup(i.resolution_date, ${interval})                     AS time,
       REPLACE(COALESCE(
         NULLIF(TRIM(u.name),          ''),
         NULLIF(TRIM(a.full_name),     ''),
         NULLIF(TRIM(a.user_name),     ''),
         NULLIF(TRIM(i.assignee_name), ''),
         '(unassigned)'
       ), '-', ' ')                                              AS metric,
       COUNT(*)                                                  AS value
FROM issues i
LEFT JOIN accounts a ON a.id = i.assignee_id
LEFT JOIN (
    SELECT account_id, MIN(user_id) AS user_id
    FROM user_accounts GROUP BY account_id
) ua ON ua.account_id = a.id
LEFT JOIN users u ON u.id = ua.user_id
WHERE i.status = 'DONE'
  AND i.resolution_date IS NOT NULL
  AND i.id LIKE 'github:%'
  AND i.assignee_id IN ( $developer_id )
  AND $__timeFilter(i.resolution_date)
GROUP BY time, metric
ORDER BY time;