SELECT 
  REPLACE(
    COALESCE(
      NULLIF(TRIM(a.full_name), ''),
      NULLIF(TRIM(a.user_name), ''),
      NULLIF(TRIM(u.name),      ''),
      base2.author_name,
      NULLIF(TRIM(a.email),     ''),
      NULLIF(TRIM(u.email),     ''),
      '(unmapped)'
    ), '-', ' ') AS Developer,
    base2.approved as 'Approved',
    base2.change_requests as 'Change Requests'
FROM
(
  SELECT 
    author_id, author_name,
    SUM(base1._approved) as approved,
    SUM(base1._change_requests) as change_requests
  FROM
  (
    SELECT 
      pr.author_id, pr.author_name,
      (CASE WHEN status = 'MERGED' THEN 1 ELSE 0 END) AS _approved,
      (SELECT COUNT(prc.id) 
      FROM pull_request_comments prc 
      WHERE prc.pull_request_id = pr.id 
      AND prc.status = 'CHANGES_REQUESTED') AS _change_requests
    FROM pull_requests pr
    WHERE pr.base_repo_id like 'github:%'
      AND $__timeFilter(pr.created_date)
      AND pr.base_repo_id in ( $repo_id )
      AND pr.base_repo_id in (
        SELECT pm.row_id
        FROM project_mapping pm
        WHERE pm.table = 'repos'
        AND pm.project_name in ( $project )
      )
  ) base1
  group by base1.author_id, base1. author_name
  order by (approved + change_requests) desc
  limit 20
) base2
LEFT JOIN accounts      a  ON a.id = base2.author_id
LEFT JOIN user_accounts ua ON ua.account_id = a.id
LEFT JOIN users         u  ON u.id = ua.user_id;