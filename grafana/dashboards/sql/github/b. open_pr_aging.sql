WITH _names AS (
  SELECT a.id AS id, REPLACE(
        COALESCE(
          NULLIF(TRIM(a.full_name), ''),
          NULLIF(TRIM(a.user_name), ''),
          NULLIF(TRIM(u.name),      ''),
          NULLIF(TRIM(a.email),     ''),
          NULLIF(TRIM(u.email),     ''),
          'u/m'
        ), '-', ' ') AS name
  FROM accounts a
  LEFT JOIN (
      SELECT account_id, MIN(user_id) AS user_id
      FROM user_accounts
      GROUP BY account_id
  ) ua ON ua.account_id = a.id
  LEFT JOIN users u ON u.id = ua.user_id
)


SELECT * FROM 
(
  SELECT r.name AS 'Repository', title as 'PR Title', DATEDIFF(CURDATE(), pr.created_date) AS 'Days Open', 
      REPLACE(n.name, 'u/m', pr.author_id) AS 'Author',
      (SELECT GROUP_CONCAT(DISTINCT n.name ORDER BY n.name SEPARATOR ', ')
        FROM pull_request_comments prc
        JOIN _names n ON n.id = prc.account_id
        WHERE prc.pull_request_id = pr.id
          AND prc.type IN ('DIFF', 'REVIEW')
          AND prc.account_id <> pr.author_id
      ) AS Reviewers, 
      pr.url as URL
  FROM pull_requests pr
  JOIN repos r ON pr.base_repo_id = r.id 
  JOIN _names n ON n.id = pr.author_id
  WHERE pr.id LIKE 'github:%' 
    AND pr.status = 'OPEN'
    AND (
         pr.author_id IN ( $developer_id )
      OR EXISTS (SELECT 1 FROM pull_request_comments prc2
                   WHERE prc2.pull_request_id = pr.id
                     AND prc2.type IN ('DIFF', 'REVIEW')
                     AND prc2.account_id <> pr.author_id
                     AND prc2.account_id IN ( $developer_id ))
    )
    AND $__timeFilter(pr.created_date)
    AND pr.base_repo_id IN ( ${repo_id} )
    AND EXISTS (SELECT 1 FROM project_mapping pm
                  WHERE pm.row_id = pr.base_repo_id
                    AND pm.`table` = 'repos'
                    AND pm.project_name IN ( ${project} ))  
) base
ORDER BY base.`Days Open` DESC;
