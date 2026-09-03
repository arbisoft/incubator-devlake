-- Per repo, counts merged PRs having no APPROVED comment from anyone other than the author, and their share of all merged PRs.
SELECT * FROM (
  SELECT 
    Repository, 
    COUNT(has_been_reviewed) - SUM(has_been_reviewed) AS 'Unapproved PR Count', 
    CONCAT(ROUND((COUNT(has_been_reviewed) - SUM(has_been_reviewed))/COUNT(has_been_reviewed)*100, 1), '%') AS 'Unapproved PRs Percentage'
  FROM (
    SELECT r.name as Repository, pr.title, 
      EXISTS (
        SELECT 1
        FROM pull_request_comments prc
        WHERE pr.id = prc.pull_request_id
        AND prc.type IN ('APPROVED')
        AND pr.author_id <> prc.account_id
      ) AS has_been_reviewed
    FROM pull_requests pr
    JOIN repos r ON pr.base_repo_id = r.id
    JOIN accounts a ON a.id = pr.author_id AND a.email IN ( $developer_id )
    WHERE pr.status = 'MERGED' 
      AND pr.id LIKE 'github:%'
      AND $__timeFilter(pr.created_date)
      AND pr.base_repo_id IN ( ${repo_id} )
      AND EXISTS (SELECT 1 FROM project_mapping pm
              WHERE pm.row_id = pr.base_repo_id
                AND pm.`table` = 'repos'
                AND pm.project_name IN ( ${project} ))
  ) base
  GROUP BY base.Repository
) base2
ORDER BY base2.`Unapproved PR Count` DESC