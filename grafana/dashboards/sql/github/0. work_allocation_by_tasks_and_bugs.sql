-- Per assignee, counts issues created in the window split into Task versus Bug by whether original_type contains 'bug', scoped to boards mapped to the selected project, top 20 by total issues.
SELECT
  REPLACE(COALESCE(
    NULLIF(TRIM(a.full_name), ''),
    NULLIF(TRIM(u.name), ''),
    NULLIF(TRIM(a.user_name), ''),
    NULLIF(TRIM(ia.assignee_name), ''),
    'unassigned'
  ), '-', ' ') AS assignee,
  SUM(CASE WHEN i.original_type not like '%bug%' THEN 1 ELSE 0 END) AS Task,
  SUM(CASE WHEN i.original_type like '%bug%' THEN 1 ELSE 0 END) AS Bug
FROM issue_assignees ia
JOIN issues i           ON i.id = ia.issue_id
JOIN board_issues bi    ON bi.issue_id = i.id
JOIN project_mapping pm ON pm.row_id = bi.board_id
                       AND pm.`table` = 'boards'
                       AND pm.project_name IN (${project:sqlstring})
LEFT JOIN accounts a       ON a.id = ia.assignee_id
LEFT JOIN user_accounts ua ON ua.account_id = ia.assignee_id
LEFT JOIN users u          ON u.id = ua.user_id
WHERE i.id LIKE 'github:%'
  AND bi.board_id IN (${repo_id:sqlstring})
  AND $__timeFilter(i.created_date)
  AND ia.assignee_id IN ( $developer_id )
GROUP BY assignee
ORDER BY (Bug + Task) DESC
LIMIT 20;