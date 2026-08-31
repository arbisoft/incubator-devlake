-- Per assignee, counts issues created in the window split into Done versus Pending by status, scoped to boards mapped to the selected project, top 20 by total issues.
SELECT
  replace(COALESCE(
    NULLIF(TRIM(a.full_name), ''),
    NULLIF(TRIM(u.name), ''),
    NULLIF(TRIM(a.user_name), ''),
    NULLIF(TRIM(ia.assignee_name), ''),
    'unassigned'
  ), '-', ' ') AS assignee,
  SUM(CASE WHEN i.status = 'DONE' THEN 1 ELSE 0 END) AS Done,
  SUM(CASE WHEN i.status <> 'DONE' THEN 1 ELSE 0 END) AS Pending
FROM issue_assignees ia
JOIN issues i           ON i.id = ia.issue_id
JOIN board_issues bi    ON bi.issue_id = i.id
JOIN project_mapping pm ON pm.row_id = bi.board_id
                       AND pm.`table` = 'boards'
                       AND pm.project_name IN (${project})
LEFT JOIN accounts a       ON a.id = ia.assignee_id
LEFT JOIN user_accounts ua ON ua.account_id = ia.assignee_id
LEFT JOIN users u          ON u.id = ua.user_id
WHERE i.id LIKE 'github:%'
  AND bi.board_id IN (${repo_id}) 
  AND $__timeFilter(i.created_date)
  AND ia.assignee_id IN ( $developer_id )
GROUP BY assignee
ORDER BY (Done + Pending) DESC
LIMIT 20;