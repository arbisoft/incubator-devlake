SELECT CONCAT(r.name, '--', r.id) AS text 
FROM project_mapping pm 
JOIN repos r ON r.id = pm.row_id 
WHERE pm.`table` = 'repos' AND pm.row_id like 'github:%'
AND pm.project_name IN ( $project )
ORDER BY text