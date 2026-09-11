-- Aging Work In Progress (bar chart). One bar per still-open ticket, longest-running first, capped
-- at the 30 oldest so the axis stays readable. p50 / p85 are NOT returned as columns here - extra
-- numeric fields would render as extra bars - so set them as static threshold lines in the panel
-- options, reading the current values off the Aging Work In Progress table panel.
-- "Work started" = FIRST ever entry into an Active Work status; moving backwards and forwards again
-- does not reset the clock. Tickets that have never entered an active status are not WIP.
WITH curated AS (
    -- Team-curated status classes. Anything not listed falls back to DevLake's standard split.
    SELECT * FROM (
        SELECT 'In Progress'  AS original_status, 'Active Work' AS status_class UNION ALL
        SELECT 'In Review',    'Waiting'                                        UNION ALL
        SELECT 'Ready for QA', 'Waiting'                                        UNION ALL
        SELECT 'Blocked',      'Waiting'
    ) m WHERE 1 = 1
),
scoped AS (
    SELECT i.id, i.issue_key, i.title, i.url, i.original_type
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
    -- First ever entry into an active status. MIN() is what makes the clock non-resetting.
    SELECT issue_id, MIN(sd) AS ws
    FROM classified
    WHERE cls = 'Active Work'
    GROUP BY issue_id
),
current_state AS (
    SELECT issue_id, st, cls, sd AS entered_current
    FROM classified
    WHERE rn_desc = 1
)
SELECT CONCAT(s.issue_key, ' - ', LEFT(s.title, 35))              AS `Ticket`,
       ROUND(TIMESTAMPDIFF(HOUR, w.ws, UTC_TIMESTAMP()) / 24, 1)  AS `Days Since Work Started`,
       s.url                                                      AS `URL`
FROM current_state c
JOIN work_started w ON w.issue_id = c.issue_id
JOIN scoped      s ON s.id       = c.issue_id
WHERE c.st <> 'Done' AND c.cls <> 'Done'
ORDER BY `Days Since Work Started` DESC
LIMIT 30;
