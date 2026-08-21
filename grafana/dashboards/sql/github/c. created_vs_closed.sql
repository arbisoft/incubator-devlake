WITH ev AS (
  SELECT i.created_date AS ts, 1 AS opened, 0 AS closed
  FROM issues i
  WHERE i.id LIKE 'github:%'
    AND $__timeFilter(i.created_date)
  UNION ALL
  SELECT i.resolution_date, 0, 1
  FROM issues i
  WHERE i.id LIKE 'github:%'
    AND i.status = 'DONE'
    AND i.resolution_date IS NOT NULL
    AND $__timeFilter(i.resolution_date)
)
SELECT $__timeGroup(ts, $interval)                                        AS time,
       SUM(opened)                                                   AS Opened,
       SUM(closed)                                                   AS Closed
FROM ev
GROUP BY time
ORDER BY time;