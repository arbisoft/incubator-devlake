-- Per assignee, counts issues by mapped type category and splits them into Planned versus Adhoc based on whether their sprint has a start date.
WITH type_map AS (
  SELECT original_type,
         CASE
           WHEN original_type LIKE '%bug%'
             OR original_type LIKE '%issue%'         THEN 'Bugs'
           WHEN original_type LIKE '%documentation%' THEN 'Documentation'
           WHEN original_type LIKE '%R&D%'           THEN 'R&D'
           WHEN original_type LIKE '%review%'        THEN 'Reviews'
           WHEN original_type LIKE '%refactor%'
             OR original_type LIKE '%debt%'
             OR original_type LIKE '%enhancement%'
             OR original_type LIKE '%improvement%'   THEN 'Refactoring'
           WHEN original_type LIKE '%task%'          THEN 'Tasks'
           ELSE 'Unclassified'
         END AS category
  FROM (SELECT DISTINCT original_type FROM issues) d
)
SELECT REPLACE(COALESCE(
         NULLIF(TRIM(a.full_name),     ''),
         NULLIF(TRIM(a.user_name),     ''),
         NULLIF(TRIM(i.assignee_name), ''),
         '(unassigned)'
       ), '-', ' ')                       AS Developer,
       SUM(tm.category = 'Bugs')          AS Bugs,
       SUM(tm.category = 'Documentation') AS Documentation,
       SUM(tm.category = 'R&D')           AS `R&D`,
       SUM(tm.category = 'Reviews')       AS Reviews,
       SUM(tm.category = 'Refactoring')   AS Refactoring,
       SUM(tm.category = 'Tasks')         AS Tasks,
       SUM(tm.category = 'Other')         AS Other,
       COUNT(*)                           AS Total,
       COUNT(IF (s.started_date IS NULL, 1, NULL)) AS Adhoc,
       COUNT(IF (s.started_date IS NOT NULL, 1, NULL)) AS Planned
FROM issues i
JOIN type_map tm ON tm.original_type <=> i.original_type
LEFT JOIN sprint_issues si ON si.issue_id = i.id
LEFT JOIN sprints s ON s.id = si.sprint_id
JOIN accounts a ON a.id = i.assignee_id AND a.email IN ( $developer_id )
WHERE i.id LIKE 'github:%'
  AND $__timeFilter(i.created_date) 
GROUP BY Developer 
ORDER BY Developer ASC