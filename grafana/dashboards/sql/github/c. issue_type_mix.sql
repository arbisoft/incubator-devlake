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
           ELSE 'Other'
         END AS category
  FROM (SELECT DISTINCT original_type FROM issues) d
)
SELECT $__timeGroup(i.created_date, $interval)     AS time,
       SUM(tm.category = 'Bugs')              AS Bugs,
       SUM(tm.category = 'Refactoring')       AS Refactoring,
       SUM(tm.category = 'Tasks')             AS Tasks,
       SUM(tm.category = 'Documentation')     AS Documentation,
       SUM(tm.category = 'R&D')               AS `R&D`,
       SUM(tm.category = 'Reviews')           AS Reviews,
       SUM(tm.category = 'Other')             AS Other
FROM issues i
JOIN type_map tm ON tm.original_type <=> i.original_type
WHERE i.id LIKE 'github:%'
  AND $__timeFilter(i.created_date)
  AND i.assignee_id IN ( $developer_id )
GROUP BY time
ORDER BY time;