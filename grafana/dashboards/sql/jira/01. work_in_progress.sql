-- Work In Progress. Count of tickets sitting in an Active Work status at the end of each day,
-- broken down by status, reconstructed from issue_status_history rather than sampled.
-- Day boundary: end of day, i.e. 00:00 of the following day, in UTC.
-- Epics and sub-tasks are excluded; edit the `curated` list to match the team's agreed taxonomy.
WITH RECURSIVE
days AS (
    SELECT DATE($__timeFrom()) AS d
    UNION ALL
    SELECT d + INTERVAL 1 DAY FROM days
    WHERE d + INTERVAL 1 DAY <= DATE($__timeTo())
),
curated AS (
    -- Team-curated status classes. Anything not listed falls back to DevLake's standard split.
    SELECT * FROM (
        SELECT 'In Progress'  AS original_status, 'Active Work' AS status_class UNION ALL
        SELECT 'In Review',    'Waiting'                                        UNION ALL
        SELECT 'Ready for QA', 'Waiting'                                        UNION ALL
        SELECT 'Blocked',      'Waiting'
    ) m WHERE 1 = 1
),
scoped AS (
    SELECT i.id
    FROM issues i
    JOIN board_issues bi    ON bi.issue_id = i.id
    JOIN project_mapping pm ON pm.row_id = bi.board_id AND pm.`table` = 'boards'
    WHERE i.id LIKE 'jira:%'
      AND pm.project_name IN ( $project )
      AND bi.board_id     IN ( $board_id )
      AND COALESCE(i.original_type, '') <> 'Epic'
      AND COALESCE(i.is_subtask, 0) = 0
      AND i.original_type IN ($issue_type)
      AND EXISTS (SELECT 1 FROM issue_labels il
                       WHERE il.issue_id = i.id AND il.label_name IN ($label))
),
hist AS (
    -- The last interval of every issue is treated as still open and re-ended at "now", because
    -- issue_trace freezes end_date at conversion time and leaves is_current_status = 0 on issues
    -- that never had a status changelog.
    SELECT h.issue_id,
           COALESCE(NULLIF(TRIM(h.original_status), ''), '(blank)') AS st,
           h.status AS std,
           h.start_date AS sd,
           CASE WHEN ROW_NUMBER() OVER (PARTITION BY h.issue_id ORDER BY h.start_date DESC) = 1
                THEN UTC_TIMESTAMP()
                ELSE h.end_date
           END AS ed
    FROM issue_status_history h
    JOIN scoped s ON s.id = h.issue_id
),
classified AS (
    SELECT h.issue_id, h.st, h.sd, h.ed,
           COALESCE(cu.status_class,
                    CASE h.std WHEN 'IN_PROGRESS' THEN 'Active Work'
                               WHEN 'TODO'        THEN 'Waiting'
                               WHEN 'DONE'        THEN 'Done'
                               ELSE 'UNCLASSIFIED' END) AS cls
    FROM hist h
    LEFT JOIN curated cu ON LOWER(TRIM(cu.original_status)) = LOWER(h.st)
)
SELECT CAST(dd.d AS DATETIME)      AS `time`,
       c.st                        AS metric,
       COUNT(DISTINCT c.issue_id)  AS value
FROM days dd
JOIN classified c ON c.sd <  dd.d + INTERVAL 1 DAY
                 AND c.ed >= dd.d + INTERVAL 1 DAY
WHERE c.cls = 'Active Work'
GROUP BY dd.d, c.st
ORDER BY 1, 2;
