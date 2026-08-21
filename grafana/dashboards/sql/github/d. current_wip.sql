SELECT REPLACE(COALESCE(
         NULLIF(TRIM(u.name),          ''),
         NULLIF(TRIM(a.full_name),     ''),
         NULLIF(TRIM(a.user_name),     ''),
         NULLIF(TRIM(a.email),         ''),
         NULLIF(TRIM(i.assignee_name), ''),
         '(unassigned)'
       ), '-', ' ')                                                  AS developer,
       COUNT(*)                                                      AS wip,
       ROUND(AVG(TIMESTAMPDIFF(DAY, i.created_date, NOW())))         AS avg_age_days,
       MAX(TIMESTAMPDIFF(DAY, i.created_date, NOW()))                AS oldest_days,
       SUM(TIMESTAMPDIFF(DAY, i.updated_date, NOW()) > 14)           AS stale_14d,
       GROUP_CONCAT(i.issue_key ORDER BY i.created_date SEPARATOR ', ') AS issues
FROM issues i
LEFT JOIN accounts a ON a.id = i.assignee_id
LEFT JOIN (
    SELECT account_id, MIN(user_id) AS user_id
    FROM user_accounts GROUP BY account_id
) ua ON ua.account_id = a.id
LEFT JOIN users u ON u.id = ua.user_id
WHERE i.status = 'IN_PROGRESS'
  AND i.id LIKE 'github:%'
  AND i.assignee_id IN ( $developer_id )
GROUP BY developer
ORDER BY wip DESC, oldest_days DESC;