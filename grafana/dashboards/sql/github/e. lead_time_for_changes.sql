WITH d AS (
    SELECT $__timeGroup(pr.merged_date, $interval)  AS bucket,
           m.pr_cycle_time / 1440.0            AS days
    FROM project_pr_metrics m
    JOIN pull_requests pr ON pr.id = m.id
    WHERE m.project_name IN ( ${project} )
      AND m.pr_cycle_time IS NOT NULL
      AND m.pr_cycle_time > 0
      AND pr.status = 'MERGED'
      AND $__timeFilter(pr.merged_date)
      AND pr.id LIKE 'github:%'
  ),
  ranked AS (
    SELECT bucket, days,
           PERCENT_RANK() OVER (PARTITION BY bucket ORDER BY days) AS pct
    FROM d
  )
  SELECT bucket                                              AS time,
         ROUND(MAX(CASE WHEN pct <= 0.50 THEN days END), 2)  AS P50,
         ROUND(MAX(CASE WHEN pct <= 0.75 THEN days END), 2)  AS P75
  FROM ranked
  GROUP BY bucket
  ORDER BY bucket;