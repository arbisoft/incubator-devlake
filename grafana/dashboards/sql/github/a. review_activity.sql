SELECT 
    REPLACE(  
    COALESCE(
      NULLIF(TRIM(a.full_name), ''),
      NULLIF(TRIM(a.user_name), ''),
      NULLIF(TRIM(a.email),     ''),
      prc.account_id
    ), '-', ' ') AS developer,
  COUNT(DISTINCT prc.pull_request_id) as `Distinct PRs Reviewed`,
  SUM(CASE WHEN prc.type = 'REVIEW' AND prc.status = 'CHANGES_REQUESTED' THEN 1 ELSE 0 END) AS `Change Requests`,
  SUM(CASE WHEN prc.type = 'REVIEW' AND prc.status = 'APPROVED' THEN 1 ELSE 0 END) AS Approvals,
  SUM(CASE WHEN prc.type in ('NORMAL', 'DIFF') THEN 1 ELSE 0 END) AS Comments
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
JOIN accounts a ON a.id = prc.account_id AND a.email IN ( ${developer_id} )
WHERE prc.commit_sha is not null 
      AND prc.commit_sha <> '' 
      AND $__timeFilter(prc.created_date)
GROUP BY prc.account_id
ORDER BY (`Change Requests` + Approvals + Comments + `Distinct PRs Reviewed`) DESC
LIMIT 20;