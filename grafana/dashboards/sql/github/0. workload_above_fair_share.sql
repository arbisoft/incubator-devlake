Select replace(member, '-', ' ') as Developers from (
  WITH scoped AS (
  SELECT
    i.id,
    COALESCE(
      NULLIF(TRIM(a.full_name), ''),
      NULLIF(TRIM(a.user_name), ''),
      NULLIF(TRIM(a.email), ''),
      NULLIF(TRIM(i.assignee_name), '')
    ) AS member
  FROM issues i
  JOIN board_issues bi    ON bi.issue_id = i.id
  JOIN project_mapping pm ON pm.row_id = bi.board_id
                         AND pm.`table` = 'boards'
                         AND pm.project_name IN (${project})
  JOIN accounts a       ON a.id = i.assignee_id
  WHERE i.id LIKE 'github:%'
    AND bi.board_id IN (${repo_id})
    AND $__timeFilter(i.created_date)
),
per_member AS (
  SELECT member, COUNT(DISTINCT id) AS tasks
  FROM scoped
  WHERE member IS NOT NULL
  GROUP BY member
),
totals AS (
  SELECT SUM(tasks) AS total_tasks, COUNT(*) AS headcount FROM per_member
)
SELECT
  p.member                                              AS `Member`,
  p.tasks                                               AS `Tasks`,
  ROUND(t.total_tasks / t.headcount, 1)                 AS `Fair share`,
  ROUND(p.tasks - (t.total_tasks / t.headcount), 1)     AS `Deviation`,
  ROUND((p.tasks - (t.total_tasks / t.headcount))
        * 100.0 / NULLIF(t.total_tasks / t.headcount, 0), 0) AS `Pct vs fair`,
  CASE
    WHEN p.tasks > (t.total_tasks / t.headcount) * 1.25 THEN 'Overloaded'
    WHEN p.tasks < (t.total_tasks / t.headcount) * 0.75 THEN 'Underloaded'
    ELSE 'Balanced'
  END                                                   AS `Status`
FROM per_member p
CROSS JOIN totals t
ORDER BY p.tasks DESC
) base
where status = 'Overloaded'
limit 10;