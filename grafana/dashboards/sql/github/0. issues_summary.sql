SELECT
  CASE WHEN LOWER(COALESCE(i.original_type,'')) LIKE '%bug%' THEN 'Bug' ELSE 'Tasks' END AS category,
  COUNT(*) AS issues
FROM issues i
JOIN board_issues bi    ON bi.issue_id = i.id
JOIN project_mapping pm ON pm.row_id = bi.board_id
                       AND pm.`table` = 'boards'
                       AND pm.project_name IN (${project})
WHERE i.id LIKE 'github:%'
  AND bi.board_id IN (${repo_id})
  AND $__timeFilter(i.created_date)
  AND i.assignee_id IN (
    SELECT a.id
    FROM accounts a
    WHERE a.email IN ( $developer_id )
  )
GROUP BY 1;