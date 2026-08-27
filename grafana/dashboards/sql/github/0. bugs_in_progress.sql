-- Counts in-progress (status other than TODO/DONE/Closed) bug issues created in the window and assigned to the selected developers, scoped to boards mapped to the selected project.
SELECT
  SUM(CASE WHEN COALESCE(i.original_type, '') like '%bug%' THEN 1 ELSE 0 END) AS issues
FROM issues i
JOIN board_issues bi    ON bi.issue_id = i.id
JOIN project_mapping pm ON pm.row_id = bi.board_id
                       AND pm.`table` = 'boards'
                       AND pm.project_name IN (${project})
WHERE i.id LIKE 'github:%'
  AND i.status NOT IN ('TODO', 'DONE', 'Closed')
  AND bi.board_id IN (${repo_id})
  AND i.assignee_id IN ( $developer_id )
  AND $__timeFilter(i.created_date)