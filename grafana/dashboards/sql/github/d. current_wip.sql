-- Counts issues currently in OPEN original_status per assignee, with no time window applied.
SELECT REPLACE(COALESCE(
         NULLIF(TRIM(u.name),          ''),
         NULLIF(TRIM(a.full_name),     ''),
         NULLIF(TRIM(a.user_name),     ''),
         NULLIF(TRIM(a.email),         ''),
         NULLIF(TRIM(i.assignee_name), ''),
         '(unassigned)'
       ), '-', ' ')                                                  AS Developer,
       COUNT(*)                                                      AS `Work In Progress`
FROM issues i
LEFT JOIN accounts a ON a.id = i.assignee_id
LEFT JOIN (
    SELECT account_id, MIN(user_id) AS user_id
    FROM user_accounts GROUP BY account_id
) ua ON ua.account_id = a.id
LEFT JOIN users u ON u.id = ua.user_id
WHERE i.original_status = 'OPEN'
  AND i.id LIKE 'github:%'
  AND i.assignee_id IN ( $developer_id )
GROUP BY developer
ORDER BY `Work In Progress` DESC;