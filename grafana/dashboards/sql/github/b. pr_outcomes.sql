-- Per author, counts PRs created in the window split by status into Merged, Open, Closed and Draft, top 20 by total.
SELECT REPLACE(
         COALESCE(
           NULLIF(TRIM(a.full_name), ''),
           NULLIF(TRIM(a.user_name), ''),
           NULLIF(TRIM(u.name),      ''),
           NULLIF(TRIM(a.email),     ''),
           NULLIF(TRIM(u.email),     ''),
           NULLIF(TRIM(pr.author_name),     ''),
           '(unmapped)'
         ), '-', ' ')                                        AS developer,
       SUM(CASE WHEN pr.status = 'MERGED' THEN 1 ELSE 0 END) AS Merged,
       SUM(CASE WHEN pr.status = 'OPEN'   THEN 1 ELSE 0 END) AS Open,
       SUM(CASE WHEN pr.status = 'CLOSED' THEN 1 ELSE 0 END) AS Closed,
       SUM(CASE WHEN pr.status = 'DRAFT' THEN 1 ELSE 0 END) AS Draft
FROM pull_requests pr
LEFT JOIN accounts a ON a.id = pr.author_id 
LEFT JOIN (
    SELECT account_id, MIN(user_id) AS user_id
    FROM user_accounts
    GROUP BY account_id
) ua ON ua.account_id = a.id
LEFT JOIN users u ON u.id = ua.user_id
WHERE pr.id LIKE 'github:%'
  AND a.id IN ( $developer_id )
  AND $__timeFilter(pr.created_date)
  AND pr.base_repo_id IN ( ${repo_id} )
  AND EXISTS (SELECT 1 FROM project_mapping pm
               WHERE pm.row_id = pr.base_repo_id
                 AND pm.`table` = 'repos'
                 AND pm.project_name IN ( ${project} ))
GROUP BY developer
ORDER BY (Merged + Open + Closed) DESC
LIMIT 20;