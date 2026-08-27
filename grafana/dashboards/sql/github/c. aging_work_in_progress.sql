-- Lists open issues not updated in over 14 days with their assignee and days since the last update.
SELECT REPLACE(COALESCE(
         NULLIF(TRIM(u.name),          ''),
         NULLIF(TRIM(a.full_name),     ''),
         NULLIF(TRIM(a.user_name),     ''),
         NULLIF(TRIM(i.assignee_name), ''),
         '(unassigned)'
       ), '-', ' ') AS Developer, 
  i.title AS Issue,
  DATEDIFF(CURDATE(), i.updated_date) AS `Lead Time Days`
FROM issues i
LEFT JOIN accounts a ON a.id = i.assignee_id
LEFT JOIN (
    SELECT account_id, MIN(user_id) AS user_id
    FROM user_accounts GROUP BY account_id
) ua ON ua.account_id = a.id
LEFT JOIN users u ON u.id = ua.user_id
WHERE i.id LIKE 'github:%'
AND i.assignee_id IN ( $developer_id )
AND i.original_status = 'OPEN'
AND DATEDIFF(CURDATE(), i.updated_date) > 14
AND $__timeFilter(i.updated_date) 
ORDER BY `Lead Time Days` DESC