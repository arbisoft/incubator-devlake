-- Per assignee, counts issues created in the window split by status into To Do, In Progress and Done.
SELECT REPLACE(COALESCE(
         NULLIF(TRIM(a.full_name), ''),
         NULLIF(TRIM(u.name),      ''),
         NULLIF(TRIM(a.user_name), ''),
         NULLIF(TRIM(a.email),     ''),
         NULLIF(TRIM(i.assignee_name), ''),
         i.assignee_id
       ), '-', ' ')                                          AS developer,
       SUM(CASE WHEN i.status = 'TODO'        THEN 1 ELSE 0 END) AS 'To Do',
       SUM(CASE WHEN i.status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS 'In Progress',
       SUM(CASE WHEN i.status = 'DONE'        THEN 1 ELSE 0 END) AS Done
FROM issues i
LEFT JOIN accounts a ON a.id = i.assignee_id
LEFT JOIN (
    SELECT account_id, MIN(user_id) AS user_id
    FROM user_accounts GROUP BY account_id
) ua ON ua.account_id = a.id
LEFT JOIN users u ON u.id = ua.user_id
LEFT JOIN issue_commits ic ON ic.issue_id = i.id
LEFT JOIN repo_commits  rc ON rc.commit_sha = ic.commit_sha
WHERE i.id LIKE 'github:%'
  AND $__timeFilter(i.created_date)
  AND i.assignee_id IN ( ${developer_id} )
GROUP BY developer
ORDER BY COUNT(*) DESC, developer;