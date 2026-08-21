WITH pr_size AS (
  SELECT pr.id,
         pr.author_id,
         SUM(c.additions + c.deletions) AS lines_changed
  FROM pull_requests pr
  JOIN pull_request_commits prc ON prc.pull_request_id = pr.id
  JOIN commits c                ON c.sha = prc.commit_sha
  WHERE pr.status = 'MERGED'
    AND pr.id LIKE 'github:%'
    AND $__timeFilter(pr.merged_date)
    AND (SELECT COUNT(*) FROM commit_parents cp
          WHERE cp.commit_sha = c.sha) < 2          -- exclude merge commits
    AND pr.author_id IN ( ${developer_id} )
  GROUP BY pr.id, pr.author_id
),
weighted AS (
  SELECT author_id,
         CASE WHEN lines_changed <  50 THEN 'Light'
              WHEN lines_changed < 500 THEN 'Standard'
              ELSE                          'Heavy'
         END AS weight
  FROM pr_size
)
SELECT REPLACE(COALESCE(
         NULLIF(TRIM(u.name),      ''),
         NULLIF(TRIM(a.full_name), ''),
         NULLIF(TRIM(a.user_name), ''),
         NULLIF(TRIM(a.email),     ''),
         '(unmapped)'
       ), '-', ' ')                                             AS `Developer`,
       COUNT(*)                                                 AS `Total PRs`,
       SUM(w.weight = 'Light')                                  AS Light,
       CONCAT(ROUND(100.0 * SUM(w.weight = 'Light')    / COUNT(*), 1), '%')  AS 'Light%',
       SUM(w.weight = 'Standard')                               AS Standard,
       CONCAT(ROUND(100.0 * SUM(w.weight = 'Standard')    / COUNT(*), 1), '%')  AS 'Standard%',
       SUM(w.weight = 'Heavy')                                  AS Heavy,
       CONCAT(ROUND(100.0 * SUM(w.weight = 'Heavy')    / COUNT(*), 1), '%')  AS 'Heavy%'
FROM weighted w
LEFT JOIN accounts a ON a.id = w.author_id
LEFT JOIN (SELECT account_id, MIN(user_id) AS user_id
           FROM user_accounts GROUP BY account_id) ua ON ua.account_id = a.id
LEFT JOIN users u ON u.id = ua.user_id
GROUP BY developer
HAVING `Total PRs` >= 3
ORDER BY Heavy DESC, `Total PRs` DESC;