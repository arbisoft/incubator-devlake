--Per PR author, counts merged PRs as approvals and sums the CHANGES_REQUESTED comments their PRs received, top 20 authors.
  SELECT 
    Developer,
    SUM(base1._approved) as `Approved`,
    SUM(base1._change_requests) as `Change Requests`
  FROM
  (
    SELECT 
      REPLACE(
        COALESCE(
          NULLIF(TRIM(a.full_name), ''),
          NULLIF(TRIM(a.user_name), ''),
          pr.author_name,
          NULLIF(TRIM(a.email),     ''),
          '(unmapped)'
      ), '-', ' ') AS Developer,
      (CASE WHEN pr.status = 'MERGED' THEN 1 ELSE 0 END) AS _approved,
      (
        SELECT COUNT(prc.id) 
        FROM pull_request_comments prc 
        WHERE prc.pull_request_id = pr.id 
        AND prc.status = 'CHANGES_REQUESTED'
      ) AS _change_requests
    
    FROM pull_requests pr
    JOIN accounts a ON a.id = pr.author_id AND a.email IN ( $developer_id )
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
  group by base1.Developer
  order by (`Approved` + `Change Requests`) desc
  limit 20;