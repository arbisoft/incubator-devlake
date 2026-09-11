-- Query B for the Aging Work In Progress bar chart. Returns a single row with the p50 and p85
-- cycle time, in days, of tickets completed inside the dashboard time range.
-- Feed it into the panel with Transform -> Config from query results (config query = B),
-- mapping p50 -> Threshold 1 and p85 -> Threshold 2, applied to `Days Since Work Started`.
-- Cycle time = first ever entry into an Active Work status -> the Done status that stuck.
WITH curated AS (
    -- Keep this list byte-identical to the one in the bar chart query.
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
    SELECT h.issue_id,
           COALESCE(NULLIF(TRIM(h.original_status), ''), '(blank)') AS st,
           h.status AS std,
           h.start_date AS sd,
           ROW_NUMBER() OVER (PARTITION BY h.issue_id ORDER BY h.start_date DESC) AS rn_desc
    FROM issue_status_history h
    JOIN scoped s ON s.id = h.issue_id
),
classified AS (
    SELECT h.issue_id, h.st, h.sd, h.rn_desc,
           COALESCE(cu.status_class,
                    CASE h.std WHEN 'IN_PROGRESS' THEN 'Active Work'
                               WHEN 'TODO'        THEN 'Waiting'
                               WHEN 'DONE'        THEN 'Done'
                               ELSE 'UNCLASSIFIED' END) AS cls
    FROM hist h
    LEFT JOIN curated cu ON LOWER(TRIM(cu.original_status)) = LOWER(h.st)
),
work_started AS (
    SELECT issue_id, MIN(sd) AS ws
    FROM classified
    WHERE cls = 'Active Work'
    GROUP BY issue_id
),
current_state AS (
    SELECT issue_id, st, cls, sd AS entered_current
    FROM classified
    WHERE rn_desc = 1
),
completed AS (
    SELECT TIMESTAMPDIFF(HOUR, w.ws, c.entered_current) / 24 AS cycle_days
    FROM current_state c
    JOIN work_started w ON w.issue_id = c.issue_id
    WHERE (c.cls = 'Done' OR c.st = 'Done')
      AND c.entered_current > w.ws
      AND c.entered_current BETWEEN $__timeFrom() AND $__timeTo()
)
-- Nearest-rank percentiles; MySQL has no PERCENTILE_CONT.
SELECT ROUND(MAX(CASE WHEN rn <= CEIL(0.50 * cnt) THEN cycle_days END), 1) AS p50,
       ROUND(MAX(CASE WHEN rn <= CEIL(0.85 * cnt) THEN cycle_days END), 1) AS p85
FROM (
    SELECT cycle_days,
           ROW_NUMBER() OVER (ORDER BY cycle_days) AS rn,
           COUNT(*)    OVER ()                     AS cnt
    FROM completed
) ranked;
