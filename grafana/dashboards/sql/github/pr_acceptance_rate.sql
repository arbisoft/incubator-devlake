SELECT developer, Merged / (Merged + (CASE WHEN Closed = 0 THEN 1 ELSE Closed END)) AS `Acceptance Rate`
FROM (
      SELECT REPLACE(
              COALESCE(
                NULLIF(TRIM(a.full_name), ''),
                NULLIF(TRIM(a.user_name), ''),
                NULLIF(TRIM(u.name),      ''),
                NULLIF(TRIM(a.email),     ''),
                NULLIF(TRIM(u.email),     ''),
                '(unmapped)'
              ), '-', ' ')                                        AS developer,
            SUM(CASE WHEN pr.status = 'MERGED' THEN 1 ELSE 0 END) AS Merged,
            SUM(CASE WHEN pr.status = 'CLOSED' THEN 1 ELSE 0 END) AS Closed
      FROM pull_requests pr
      LEFT JOIN accounts a ON a.id = pr.author_id
      LEFT JOIN (
          SELECT account_id, MIN(user_id) AS user_id
          FROM user_accounts
          GROUP BY account_id
      ) ua ON ua.account_id = a.id
      LEFT JOIN users u ON u.id = ua.user_id
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