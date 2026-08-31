-- Sums additions and deletions per contributor across commits authored in the window (deduped by commit SHA), scoped to repos mapped to the selected project, top 20 by total lines changed.
WITH dedup AS (
  SELECT DISTINCT
    COALESCE(a.full_name, u.name, c.author_name) AS contributor,
    c.sha, c.additions, c.deletions
  FROM commits c
  JOIN repo_commits rc       ON rc.commit_sha = c.sha 
    AND rc.repo_id in (${repo_id}) 
    AND rc.repo_id in (
        select pm.row_id 
        from project_mapping pm 
        where pm.table = 'repos' and pm.project_name in (${project})
        )
  LEFT JOIN accounts a ON a.email = c.author_email
  LEFT JOIN user_accounts ua ON ua.account_id = a.id
  LEFT JOIN users u          ON u.id = ua.user_id
  WHERE 
  $__timeFilter(c.authored_date)
    AND COALESCE(u.name, c.author_name) IS NOT NULL
    AND a.id IN ( $developer_id )
)
SELECT
  contributor,
  SUM(additions)      AS 'Lines Added',
  SUM(deletions)     AS 'Lines Removed'
FROM dedup
GROUP BY contributor
ORDER BY SUM(additions) + SUM(deletions) DESC
LIMIT 20;