-- Per calendar month, counts PRs created in the window by the outcome of their most recent non-author review: Approved, Changes requested, Commented only, or No review.
WITH latest_review AS (
  SELECT
    pr.id,
    pr.created_date,
    (
        SELECT c.status
        FROM pull_request_comments c
        WHERE c.pull_request_id = pr.id
            AND c.type = 'REVIEW'
            AND c.account_id <> pr.author_id
        ORDER BY c.created_date DESC
        LIMIT 1) AS final_status
  FROM pull_requests pr
  JOIN repos r ON r.id = pr.base_repo_id
    AND r.deleted = 0
    AND r.id IN (${repo_id})
    AND pr.base_repo_id IN (
      SELECT pm.row_id FROM project_mapping pm
      WHERE pm.`table` = 'repos'
        AND pm.project_name IN (${project})
    )
  WHERE $__timeFilter(pr.created_date)
        AND pr.author_id IN ( $developer_id )
  order by pr.created_date
)
SELECT
  DATE_FORMAT(created_date, '%b %Y') AS month,
  SUM(CASE WHEN final_status = 'APPROVED'          THEN 1 ELSE 0 END) AS Approved,
  SUM(CASE WHEN final_status = 'CHANGES_REQUESTED' THEN 1 ELSE 0 END) AS `Changes requested`,
  SUM(CASE WHEN final_status IS NOT NULL
            AND final_status NOT IN ('APPROVED','CHANGES_REQUESTED')
                                                   THEN 1 ELSE 0 END) AS `Commented only`,
  SUM(CASE WHEN final_status IS NULL               THEN 1 ELSE 0 END) AS `No review`
FROM latest_review
GROUP BY DATE_FORMAT(created_date, '%b %Y');