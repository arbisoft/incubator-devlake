SELECT DISTINCT il.label_name AS text
FROM issue_labels il
JOIN board_issues bi ON bi.issue_id = il.issue_id
WHERE il.issue_id LIKE 'jira:%'
  AND bi.board_id IN ( $board_id )
  AND COALESCE(il.label_name, '') <> ''
ORDER BY text
