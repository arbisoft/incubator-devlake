-- Per repo, averages over PRs the lines changed after the first CHANGES_REQUESTED comment as a percentage of the lines changed before it.
WITH first_comment_dates AS (SELECT pr.id AS pull_request_id, 
  COALESCE((
    SELECT created_date 
    FROM pull_request_comments prci 
    WHERE prci.pull_request_id = pr.id 
    AND prci.status IN ('CHANGES_REQUESTED')
    ORDER BY created_at ASC
    LIMIT 1
  ), CAST('1990-01-01 00:00:00' AS DATETIME)) AS first_comment_date
FROM pull_requests pr
WHERE pr.id LIKE 'github:%' AND pr.status NOT LIKE 'CLOSED'
  AND pr.base_repo_id IN ( ${repo_id} )
  AND EXISTS (SELECT 1 FROM project_mapping pm
          WHERE pm.row_id = pr.base_repo_id
            AND pm.`table` = 'repos'
            AND pm.project_name IN ( ${project} )))
,
per_pr_calculations AS (SELECT 
  prc.pull_request_id,
  SUM(CASE WHEN c.committed_date < fcd.first_comment_date THEN c.additions + c.deletions ELSE 0 END) AS base_changes,
  SUM(CASE WHEN c.committed_date > fcd.first_comment_date THEN c.additions + c.deletions ELSE 0 END) AS rework_changes
FROM pull_request_commits prc
JOIN first_comment_dates fcd ON prc.pull_request_id = fcd.pull_request_id
JOIN commits c ON prc.commit_sha = c.sha
GROUP BY prc.pull_request_id)

SELECT * FROM 
(
  SELECT r.name AS Repository, pm.project_name AS Project, AVG(100 * rework_changes / CASE WHEN base_changes = 0 THEN 1 ELSE base_changes END) AS `Rework Percentage`
      FROM per_pr_calculations ppc
    JOIN pull_requests pr ON ppc.pull_request_id = pr.id
    LEFT JOIN repos r ON pr.base_repo_id = r.id
    LEFT JOIN project_mapping pm ON pm.row_id = r.id AND pm.table = 'repos'
    WHERE pr.base_repo_id IN ( ${repo_id} )
    AND EXISTS (SELECT 1 FROM project_mapping pm
            WHERE pm.row_id = pr.base_repo_id
              AND pm.`table` = 'repos'
              AND pm.project_name IN ( ${project} ))
    GROUP BY r.name, pm.project_name
) base
ORDER BY base.`Rework Percentage` DESC
LIMIT 20;