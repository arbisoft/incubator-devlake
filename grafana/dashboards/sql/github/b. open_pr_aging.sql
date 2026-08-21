SELECT * FROM 
(
  SELECT r.name AS 'Repository', title as 'PR Title', DATEDIFF(CURDATE(), pr.created_date) AS 'Days Open', 
      REPLACE(
        COALESCE(
          NULLIF(TRIM(a.full_name), ''),
          NULLIF(TRIM(a.user_name), ''),
          NULLIF(TRIM(u.name),      ''),
          NULLIF(TRIM(a.email),     ''),
          NULLIF(TRIM(u.email),     ''),
          pr.author_id
        ), '-', ' ') AS 'Author',
        (SELECT GROUP_CONCAT(DISTINCT COALESCE(a.full_name) ORDER BY a.full_name SEPARATOR ', ')
          FROM pull_request_comments prc
          JOIN accounts a ON a.id = prc.account_id
          WHERE prc.pull_request_id = pr.id
            AND prc.type IN ('DIFF', 'REVIEW')
            AND prc.account_id <> pr.author_id) AS Reviewers, pr.url as URL
  FROM pull_requests pr
  JOIN accounts a ON a.id = pr.author_id 
  JOIN repos r ON pr.base_repo_id = r.id 
  LEFT JOIN (
      SELECT account_id, MIN(user_id) AS user_id
      FROM user_accounts
      GROUP BY account_id
  ) ua ON ua.account_id = a.id
  LEFT JOIN users u ON u.id = ua.user_id
  WHERE pr.id LIKE 'github:%' 
    AND pr.status = 'OPEN'
    AND pr.author_id IN ( $developer_id )
    AND $__timeFilter(pr.created_date)
    AND pr.base_repo_id IN ( ${repo_id} )
    AND EXISTS (SELECT 1 FROM project_mapping pm
                  WHERE pm.row_id = pr.base_repo_id
                    AND pm.`table` = 'repos'
                    AND pm.project_name IN ( ${project} ))  
) base
ORDER BY base.`Days Open` DESC;