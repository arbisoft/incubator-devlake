SELECT DISTINCT pm.project_name
FROM project_mapping pm
WHERE pm.`table` = 'boards' AND pm.row_id LIKE 'jira:%'
ORDER BY pm.project_name
