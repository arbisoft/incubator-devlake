-- Per mapped issue type and priority, derives median and P75 of lead_time_minutes in days for DONE issues, keeping groups with at least 3 issues.
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
),
d AS (
  SELECT tm.category                                        AS type,
         COALESCE(NULLIF(TRIM(i.priority), ''), '(none)')   AS priority,
         i.lead_time_minutes / 1440.0                       AS days
  FROM issues i
  JOIN type_map tm ON tm.original_type <=> i.original_type
  JOIN accounts a ON a.id = i.assignee_id AND a.email IN ( $developer_id )
  WHERE i.status = 'DONE'
    AND i.lead_time_minutes IS NOT NULL
    AND i.lead_time_minutes > 0
    AND i.id LIKE 'github:%'
    AND $__timeFilter(i.resolution_date)
),
ranked AS (
  SELECT type, priority, days,
         CUME_DIST() OVER (PARTITION BY type, priority ORDER BY days) AS cd
  FROM d
)
SELECT type AS Type,
       priority AS Priority,
       COUNT(*)                                            AS `Total Issues`,
       ROUND(MIN(CASE WHEN cd >= 0.50 THEN days END), 1)  AS `Median Days`,
       ROUND(MIN(CASE WHEN cd >= 0.75 THEN days END), 1)  AS `P75 Days`
FROM ranked
GROUP BY type, priority
HAVING `Total Issues` >= 3
ORDER BY type, `Median Days` DESC;