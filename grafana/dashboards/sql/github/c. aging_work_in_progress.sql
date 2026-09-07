-- Lists open issues not updated in over 14 days with their assignee and days since the last update.
SELECT REPLACE(COALESCE(
         NULLIF(TRIM(a.full_name),     ''),
         NULLIF(TRIM(a.user_name),     ''),
         NULLIF(TRIM(i.assignee_name), ''),
         '(unassigned)'
       ), '-', ' ') AS Developer, 
  i.title AS Issue,
  DATEDIFF(CURDATE(), i.updated_date) AS `Lead Time Days`
FROM issues i
JOIN accounts a ON a.id = i.assignee_id AND a.email IN ( $developer_id )
WHERE i.id LIKE 'github:%'
  AND i.original_status = 'OPEN'
  AND DATEDIFF(CURDATE(), i.updated_date) > 14
  AND $__timeFilter(i.updated_date) 
ORDER BY `Lead Time Days` DESC