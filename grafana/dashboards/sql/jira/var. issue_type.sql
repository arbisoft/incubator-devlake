SELECT DISTINCT i.original_type AS text
FROM issues i
JOIN board_issues bi ON bi.issue_id = i.id
WHERE i.id LIKE 'jira:%'
  AND bi.board_id IN ( $board_id )
  AND COALESCE(i.original_type, '') NOT IN ('', 'Epic')
ORDER BY text
