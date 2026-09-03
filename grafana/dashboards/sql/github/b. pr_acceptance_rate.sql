-- Per author, divides merged PRs by merged plus closed PRs created in the window (closed floored at 1), top 20 by rate.
SELECT developer, Merged / (Merged + (CASE WHEN Closed = 0 THEN 1 ELSE Closed END)) AS `Acceptance Rate`
FROM (
      SELECT REPLACE(
              COALESCE(
                NULLIF(TRIM(a.full_name), ''),
                NULLIF(TRIM(a.user_name), ''),
                NULLIF(TRIM(a.email),     ''),
                '(unmapped)'
              ), '-', ' ')                                        AS developer,
            SUM(CASE WHEN pr.status = 'MERGED' THEN 1 ELSE 0 END) AS Merged,
            SUM(CASE WHEN pr.status = 'CLOSED' THEN 1 ELSE 0 END) AS Closed
      FROM pull_requests pr
      JOIN accounts a ON a.id = pr.author_id AND a.email IN ( $developer_id )
      WHERE pr.id LIKE 'github:%'
        AND $__timeFilter(pr.created_date)
        AND pr.base_repo_id IN ( ${repo_id} )
        AND EXISTS (SELECT 1 FROM project_mapping pm
               WHERE pm.row_id = pr.base_repo_id
                 AND pm.`table` = 'repos'
                 AND pm.project_name IN ( ${project} ))
      GROUP BY developer
) base
ORDER BY `Acceptance Rate` desc
LIMIT 20;