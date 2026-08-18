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
  LEFT JOIN user_accounts ua ON ua.account_id = c.author_id
  LEFT JOIN users u          ON u.id = ua.user_id
  LEFT JOIN accounts a       ON a.id = ua.account_id
  WHERE 
  $__timeFilter(c.authored_date)
    AND COALESCE(u.name, c.author_name) IS NOT NULL
)
SELECT
  contributor,
  SUM(additions)      AS 'Lines Added',
  SUM(deletions)     AS 'Lines Removed'
FROM dedup
GROUP BY contributor
ORDER BY SUM(additions) + SUM(deletions) DESC
LIMIT 20;