WITH ranked AS (
  SELECT
    c.account_id,
    c.pull_request_id,
    c.status,
    ROW_NUMBER() OVER (
      PARTITION BY c.account_id, c.pull_request_id
      ORDER BY c.created_date DESC
    ) AS rn
  FROM pull_request_comments c
  JOIN pull_requests pr   ON pr.id = c.pull_request_id AND pr.base_repo_id in (${repo_id}) and pr.base_repo_id in (select pm.row_id from project_mapping pm where pm.table = 'repos' and pm.project_name in (${project}))
  WHERE c.type = 'REVIEW'
    AND $__timeFilter(c.created_date)
    AND c.account_id <> pr.author_id
    AND c.account_id IN ( $developer_id )
)
SELECT
  COALESCE(
    NULLIF(TRIM(a.full_name), ''),
    NULLIF(TRIM(u.name), ''),
    NULLIF(TRIM(a.user_name), ''),
    'unknown user'
  ) AS reviewer,
  SUM(CASE WHEN rk.status = 'APPROVED'          THEN 1 ELSE 0 END) AS Approved,
  SUM(CASE WHEN rk.status = 'CHANGES_REQUESTED' THEN 1 ELSE 0 END) AS Rejected,
  SUM(CASE WHEN rk.status NOT IN ('APPROVED','CHANGES_REQUESTED')
             OR rk.status IS NULL               THEN 1 ELSE 0 END) AS Commented
FROM ranked rk
  LEFT JOIN accounts a       ON a.id = rk.account_id
  LEFT JOIN user_accounts ua ON ua.account_id = rk.account_id
  LEFT JOIN users u          ON u.id = ua.user_id
WHERE rk.rn = 1
GROUP BY reviewer
ORDER BY COUNT(*) DESC
LIMIT 20;