-- Sums additions and deletions per contributor across commits authored in the window (deduped by commit SHA), scoped to repos mapped to the selected project, top 20 by total lines changed.
WITH dedup AS (
  SELECT DISTINCT
    COALESCE(a.full_name, a.user_name, c.author_name) AS contributor,
    c.sha, c.additions, c.deletions
  FROM commits c
  JOIN repo_commits rc       ON rc.commit_sha = c.sha 
    AND rc.repo_id in (${repo_id}) 
    AND rc.repo_id in (
        select pm.row_id 
        from project_mapping pm 
        where pm.table = 'repos' and pm.project_name in (${project})
        )
  JOIN accounts a ON a.email = c.author_email AND a.email IN ( $developer_id )
  WHERE 
  $__timeFilter(c.authored_date)
)
SELECT
  contributor,
  SUM(additions)      AS 'Lines Added',
  SUM(deletions)     AS 'Lines Removed'
FROM dedup
GROUP BY contributor
ORDER BY SUM(additions) + SUM(deletions) DESC
LIMIT 20;