-- Per repo, counts merged PRs that had no APPROVED review from anyone other than the author before the merge, and their share of all merged PRs.
SELECT
  r.name AS Repository,
  COUNT(*) AS 'Merged PR Count',
  SUM(CASE WHEN EXISTS (
        SELECT 1
        FROM pull_request_comments prc
        WHERE prc.pull_request_id = pr.id
          AND prc.type    = 'REVIEW'
          AND prc.status  = 'APPROVED'
          AND prc.account_id <> pr.author_id
          AND (pr.merged_date IS NULL OR prc.created_date <= pr.merged_date)
      ) THEN 0 ELSE 1 END) AS 'Unapproved PR Count',
  CONCAT(ROUND(100.0 * SUM(CASE WHEN EXISTS (
        SELECT 1
        FROM pull_request_comments prc
        WHERE prc.pull_request_id = pr.id
          AND prc.type    = 'REVIEW'
          AND prc.status  = 'APPROVED'
          AND prc.account_id <> pr.author_id
          AND (pr.merged_date IS NULL OR prc.created_date <= pr.merged_date)
      ) THEN 0 ELSE 1 END) / COUNT(*), 1), '%') AS 'Unapproved PRs Percentage'
FROM pull_requests pr
JOIN repos r    ON r.id = pr.base_repo_id
JOIN accounts a ON a.id = pr.author_id AND a.email IN ( $developer_id )
WHERE pr.status = 'MERGED'
  AND pr.id LIKE 'github:%'
  AND $__timeFilter(pr.created_date)
  AND pr.base_repo_id IN ( ${repo_id} )
  AND EXISTS (SELECT 1 FROM project_mapping pm
               WHERE pm.row_id = pr.base_repo_id
                 AND pm.`table` = 'repos'
                 AND pm.project_name IN ( ${project} ))
GROUP BY r.name
ORDER BY `Unapproved PR Count` DESC
