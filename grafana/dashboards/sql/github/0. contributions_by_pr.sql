SELECT
  REPLACE(
    COALESCE(
      NULLIF(TRIM(a.full_name), ''),
      NULLIF(TRIM(u.name), ''),
      NULLIF(TRIM(a.user_name), ''),
      NULLIF(TRIM(pr.author_name), ''),
      'unknown user'
    ), '-', ' ') AS contributor,
  COUNT(DISTINCT CASE WHEN pr.status = 'MERGED' THEN pr.id END) AS Merged,
  COUNT(DISTINCT CASE WHEN pr.status = 'CLOSED' THEN pr.id END) AS Closed,
  COUNT(DISTINCT CASE WHEN pr.status = 'OPEN'   THEN pr.id END) AS `Open`
FROM pull_requests pr
JOIN repos r ON r.id = pr.base_repo_id
  AND r.deleted = 0
  AND r.id IN (${repo_id:sqlstring})
  AND pr.base_repo_id IN (
    SELECT pm.row_id FROM project_mapping pm
    WHERE pm.`table` = 'repos'
      AND pm.project_name IN (${project:sqlstring})
  )
LEFT JOIN accounts a       ON a.id = pr.author_id
LEFT JOIN user_accounts ua ON ua.account_id = pr.author_id
LEFT JOIN users u          ON u.id = ua.user_id
WHERE $__timeFilter(pr.created_date)
    AND pr.author_id IN ( $developer_id )
GROUP BY contributor
ORDER BY COUNT(DISTINCT pr.id) DESC
LIMIT 20;