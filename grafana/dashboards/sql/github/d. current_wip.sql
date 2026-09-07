-- Counts issues currently in OPEN original_status per assignee, with no time window applied.
SELECT REPLACE(COALESCE(
         NULLIF(TRIM(a.full_name),     ''),
         NULLIF(TRIM(a.user_name),     ''),
         NULLIF(TRIM(a.email),         ''),
         NULLIF(TRIM(i.assignee_name), ''),
         '(unassigned)'
       ), '-', ' ')                                                  AS Developer,
       COUNT(*)                                                      AS `Work In Progress`
FROM issues i
LEFT JOIN accounts a ON a.id = i.assignee_id AND a.email IN ( $developer_id )
WHERE i.original_status = 'OPEN'
  AND i.id LIKE 'github:%'
GROUP BY developer
ORDER BY `Work In Progress` DESC;