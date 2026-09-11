-- Per repo, counts branches whose tip commit is older than the staleness threshold, excluding the default branch and any branch with an open PR.
-- Requires gitextractor (Collect Git Branch); refs.created_date is never populated, so age comes from the tip commit.
WITH branch_tips AS (
  SELECT
    rf.repo_id,
    -- gitextractor stores remote refs as 'origin/<name>'; normalise to the short branch name
    CASE WHEN rf.name LIKE 'origin/%' THEN SUBSTRING(rf.name, 8) ELSE rf.name END AS branch_name,
    MAX(rf.is_default) AS is_default,
    MAX(COALESCE(c.committed_date, c.authored_date)) AS last_commit_date
  FROM refs rf
  JOIN repos r    ON r.id = rf.repo_id
  LEFT JOIN commits c ON c.sha = rf.commit_sha
  WHERE rf.ref_type = 'BRANCH'
    AND rf.repo_id LIKE 'github:%'
    AND rf.name <> 'origin/HEAD'
    AND rf.repo_id IN ( ${repo_id} )
    AND EXISTS (SELECT 1 FROM project_mapping pm
                 WHERE pm.row_id = rf.repo_id
                   AND pm.`table` = 'repos'
                   AND pm.project_name IN ( ${project} ))
  GROUP BY rf.repo_id, branch_name
)

SELECT
  r.name AS 'Repository',
  COUNT(*) AS 'Stale Branch Count'
FROM branch_tips bt
JOIN repos r ON r.id = bt.repo_id
WHERE bt.is_default = 0
  AND bt.last_commit_date IS NOT NULL
  AND bt.last_commit_date < DATE_SUB(NOW(), INTERVAL 30 DAY)   -- staleness threshold
  AND NOT EXISTS (
        SELECT 1
        FROM pull_requests pr
        WHERE pr.base_repo_id = bt.repo_id
          AND pr.head_ref = bt.branch_name
          AND pr.status = 'OPEN'
      )
GROUP BY r.name
ORDER BY `Stale Branch Count` DESC
