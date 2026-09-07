-- Counts distinct commits authored in the window per contributor, scoped to repos mapped to the selected project, top 20 by commit count.
SELECT
  COALESCE(a.full_name, c.author_name, a.email) AS contributor,
  COUNT(DISTINCT c.sha)           AS commit_count
FROM commits c
JOIN repo_commits rc      ON rc.commit_sha = c.sha 
    AND rc.repo_id in (${repo_id}) 
    AND rc.repo_id in (
        select pm.row_id 
        from project_mapping pm 
        where pm.table = 'repos' and pm.project_name in (${project})
        )
JOIN accounts a       ON a.email = c.author_email AND a.email IN ( $developer_id )
WHERE $__timeFilter(c.authored_date)
GROUP BY contributor
ORDER BY commit_count DESC
LIMIT 20;
