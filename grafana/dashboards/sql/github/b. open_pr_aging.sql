-- Lists open PRs with days since creation, author and comma-joined reviewer names, keeping PRs the selected developer either authored or reviewed.
WITH _names AS (
  SELECT a.id AS id, 
    REPLACE(
      COALESCE(
        NULLIF(TRIM(a.full_name), ''),
        NULLIF(TRIM(a.user_name), ''),
        NULLIF(TRIM(a.email),     ''),
        'u/m'
      ), '-', ' ') AS name
  FROM accounts a
  WHERE a.id LIKE 'github:%'
)


SELECT * FROM 
(
  SELECT 
    r.name AS 'Repository', 
    title as 'PR Title', 
    DATEDIFF(CURDATE(), pr.created_date) AS 'Days Open', 
    REPLACE(n.name, 'u/m', pr.author_id) AS 'Author',
    (
      SELECT GROUP_CONCAT(DISTINCT n.name ORDER BY n.name SEPARATOR ', ')
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
  JOIN accounts a ON a.id = pr.author_id
  WHERE pr.id LIKE 'github:%' 
    AND pr.status = 'OPEN'
    AND (
         a.email IN ( $developer_id )
      OR EXISTS (
                  SELECT 1 
                  FROM pull_request_comments prc2
                  JOIN accounts a ON a.id = prc2.account_id AND a.email IN ( $developer_id )
                  WHERE prc2.pull_request_id = pr.id
                    AND prc2.type IN ('DIFF', 'REVIEW')
                    AND prc2.account_id <> pr.author_id
                )
    )
    AND $__timeFilter(pr.created_date)
    AND pr.base_repo_id IN ( ${repo_id} )
    AND EXISTS (SELECT 1 FROM project_mapping pm
                  WHERE pm.row_id = pr.base_repo_id
                    AND pm.`table` = 'repos'
                    AND pm.project_name IN ( ${project} ))  
) base
ORDER BY base.`Days Open` DESC;
