WITH ev AS (
  SELECT i.created_date AS ts, 1 AS opened, 0 AS closed
  FROM issues i
  JOIN accounts a ON a.id = i.creator_id AND a.email IN ( $developer_id )
  JOIN board_issues bi ON i.id = bi.issue_id
    AND bi.board_id in ( ${repo_id} )
  JOIN project_mapping pm 
    ON pm.row_id = bi.board_id
    AND pm.table = 'repos'
    AND pm.project_name IN ( ${project} )
  WHERE i.id LIKE 'github:%'
    AND $__timeFilter(i.created_date)
  UNION ALL
  SELECT i.resolution_date, 0, 1
  FROM issues i
  JOIN accounts a ON a.id = i.assignee_id IN ( $developer_id )
  JOIN board_issues bi ON i.id = bi.issue_id
    AND bi.board_id in ( ${repo_id} )
  JOIN project_mapping pm 
    ON pm.row_id = bi.board_id
    AND pm.table = 'repos'
    AND pm.project_name IN ( ${project} )
  WHERE i.id LIKE 'github:%'
    AND i.status = 'DONE'
    AND i.resolution_date IS NOT NULL
    AND $__timeFilter(i.resolution_date)
)
SELECT $__timeGroup(ts, $interval)                                        AS time,
       SUM(opened)                                                   AS Opened,
       SUM(closed)                                                   AS Closed
FROM ev
GROUP BY time
ORDER BY time;