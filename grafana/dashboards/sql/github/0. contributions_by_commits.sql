SELECT
  COALESCE(a.full_name, u.name, c.author_name, a.email) AS contributor,
  COUNT(DISTINCT c.sha)           AS commit_count
FROM commits c
JOIN repo_commits rc      ON rc.commit_sha = c.sha 
    AND rc.repo_id in (${repo_id}) 
    AND rc.repo_id in (
        select pm.row_id 
        from project_mapping pm 
        where pm.table = 'repos' and pm.project_name in (${project})
        )
LEFT JOIN accounts a       ON a.email = c.author_email
LEFT JOIN user_accounts ua ON ua.account_id = a.id
LEFT JOIN users u          ON u.id = ua.user_id
WHERE $__timeFilter(c.authored_date)
    AND a.id IN ( $developer_id )
GROUP BY contributor
ORDER BY commit_count DESC
LIMIT 20;