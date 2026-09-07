SELECT DISTINCT pm.project_name  
FROM project_mapping pm 
WHERE pm.`table` = 'repos' AND pm.row_id like 'github:%'
ORDER BY pm.project_name 