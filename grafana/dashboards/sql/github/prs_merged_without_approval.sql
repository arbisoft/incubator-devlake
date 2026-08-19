SELECT * FROM (
  SELECT Repository, COUNT(has_been_reviewed) - SUM(has_been_reviewed) AS 'Unapproved PR Count', CONCAT(ROUND((COUNT(has_been_reviewed) - SUM(has_been_reviewed))/COUNT(has_been_reviewed)*100, 1), '%') AS 'Unapproved PRs Percentage'
  FROM (
    SELECT r.name as Repository, pr.title, EXISTS (
      SELECT 1
      FROM pull_request_comments prc
      WHERE pr.id = prc.pull_request_id
      AND prc.type IN ('APPROVED')
      AND pr.author_id <> prc.account_id
    ) AS has_been_reviewed
    FROM pull_requests pr
    JOIN repos r ON pr.base_repo_id = r.id
    WHERE pr.status = 'MERGED'
  ) base
  GROUP BY base.Repository
) base2
ORDER BY base2.`Unapproved PR Count` DESC;