-- Buckets PRs by total lines changed summed across their commits into four size bands, reporting PR count and share of total.
WITH pr_size AS (
  SELECT pr.id,
         SUM(c.additions + c.deletions) AS lines_changed
  FROM pull_requests pr
  JOIN pull_request_commits prc ON prc.pull_request_id = pr.id
  JOIN commits c                ON c.sha = prc.commit_sha AND c.author_email IN ( $developer_id )
  WHERE pr.id LIKE 'github:%'
    AND $__timeFilter(pr.created_date)
    AND pr.base_repo_id IN ( ${repo_id} )
    AND EXISTS (SELECT 1 FROM project_mapping pm
                 WHERE pm.row_id = pr.base_repo_id
                   AND pm.`table` = 'repos'
                   AND pm.project_name IN ( ${project} ))
  GROUP BY pr.id
),
bucketed AS (
  SELECT CASE
           WHEN lines_changed <  200 THEN '1. < 200'
           WHEN lines_changed <  500 THEN '2. 200-499'
           WHEN lines_changed < 1000 THEN '3. 500-999'
           ELSE                           '4. 1000+'
         END      AS bucket,
         COUNT(*) AS prs
  FROM pr_size
  GROUP BY bucket
)
SELECT bucket,
       prs AS 'PR Count',
       CONCAT(ROUND(100.0 * prs / SUM(prs) OVER (), 1), '%') AS Percentage
FROM bucketed
ORDER BY bucket;