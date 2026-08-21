WITH dedup AS (
  SELECT DISTINCT
    COALESCE(a.full_name, u.name, c.author_name) AS contributor,
    c.sha, c.additions, c.deletions
  FROM commits c
  JOIN repo_commits rc       ON rc.commit_sha = c.sha 
    AND rc.repo_id like 'github:%'
    AND rc.repo_id in (${repo_id}) 
    AND rc.repo_id in (
      select pm.row_id 
      from project_mapping pm 
      where pm.table = 'repos' 
      AND pm.project_name in (${project}))
  LEFT JOIN accounts a ON a.id = c.author_id 
  LEFT JOIN (
      SELECT account_id, MIN(user_id) AS user_id
      FROM user_accounts
      GROUP BY account_id
  ) ua ON ua.account_id = a.id
  LEFT JOIN users u ON u.id = ua.user_id
  WHERE $__timeFilter(c.authored_date)
  AND NOT EXISTS (
      SELECT 1 FROM commit_parents cp
      WHERE cp.commit_sha = c.sha
      GROUP BY cp.commit_sha HAVING COUNT(*) > 1
    )
)
SELECT
  contributor,
  SUM(additions)      AS 'Lines Added',
  SUM(deletions)     AS 'Lines Removed'
FROM dedup
GROUP BY contributor
ORDER BY SUM(additions) + SUM(deletions) DESC
LIMIT 20;