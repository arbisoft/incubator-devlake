SELECT CONCAT(b.name, '--', b.id) AS text
FROM project_mapping pm
JOIN boards b ON b.id = pm.row_id
WHERE pm.`table` = 'boards' AND pm.row_id LIKE 'jira:%'
  AND pm.project_name IN ( $project )
ORDER BY text
