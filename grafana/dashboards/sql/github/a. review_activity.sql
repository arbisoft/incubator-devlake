SELECT
  REPLACE(
  COALESCE(
    NULLIF(TRIM(a.full_name), ''),
    NULLIF(TRIM(a.user_name), ''),
    NULLIF(TRIM(u.name),      ''),
    NULLIF(TRIM(a.email),     ''),
    NULLIF(TRIM(u.email),     ''),
    base.account_id
  ), '-', ' ') AS developer,
  base.pr_approved AS Approvals,
  base.change_request AS 'Change Requests',
  base.comment AS Comments,
  base.prs AS 'Distinct PRs Reviewed'
FROM 
(
  SELECT 
    prc.account_id,
    COUNT(DISTINCT prc.pull_request_id) as prs,
    SUM(CASE WHEN prc.type = 'REVIEW' AND prc.status = 'CHANGES_REQUESTED' THEN 1 ELSE 0 END) AS change_request,
    SUM(CASE WHEN prc.type = 'REVIEW' AND prc.status = 'APPROVED' THEN 1 ELSE 0 END) AS pr_approved,
    SUM(CASE WHEN prc.type in ('NORMAL', 'DIFF') THEN 1 ELSE 0 END) AS comment
  FROM pull_request_comments prc
  JOIN pull_requests pr ON prc.pull_request_id = pr.id
      AND pr.id like 'github:%'
      AND pr.base_repo_id in ( ${repo_id} )
      AND pr.base_repo_id in (
        SELECT pm.row_id
        FROM project_mapping pm
        WHERE pm.table = 'repos'
        AND pm.project_name in ( ${project} )
      )
  WHERE prc.commit_sha is not null 
        AND prc.commit_sha <> '' 
        AND $__timeFilter(prc.created_date)
        AND prc.account_id IN ( ${developer_id} )
  GROUP BY prc.account_id
  ORDER BY (change_request + pr_approved + comment + prs) DESC
  LIMIT 20
) base
LEFT JOIN accounts a ON a.id = base.account_id 
LEFT JOIN (
    SELECT account_id, MIN(user_id) AS user_id
    FROM user_accounts
    GROUP BY account_id
) ua ON ua.account_id = a.id
LEFT JOIN users u ON u.id = ua.user_id