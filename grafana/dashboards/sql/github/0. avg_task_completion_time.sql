-- Averages lead_time_minutes converted to days across resolved non-bug issues assigned to the selected developers, scoped to boards mapped to the selected project.
SELECT AVG(i.lead_time_minutes/1440) AS avg_days_to_resolve
FROM issues i
JOIN board_issues bi    ON bi.issue_id = i.id
JOIN project_mapping pm ON pm.row_id = bi.board_id
                       AND pm.`table` = 'boards'
                       AND pm.project_name IN (${project})
WHERE i.id LIKE 'github:%'
  AND i.original_type NOT LIKE '%bug%'
  AND i.assignee_id IN ( $developer_id )
  AND i.resolution_date IS NOT NULL
  AND bi.board_id IN (${repo_id})
  AND $__timeFilter(i.resolution_date);