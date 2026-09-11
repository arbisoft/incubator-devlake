-- Single stat: total number of stale branches across the selected repos (tip commit older than the threshold, excluding the default branch and branches with an open PR).
-- Requires gitextractor (Collect Git Branch); refs.created_date is never populated, so age comes from the tip commit.
WITH scoped_repos AS (
  SELECT r.id
  FROM repos r
  JOIN project_mapping pm
    ON  pm.row_id       = r.id
    AND pm.`table`      = 'repos'
    AND pm.project_name IN ( ${project} )
  WHERE r.id LIKE 'github:%'
    AND r.deleted = 0
    AND r.id IN ( ${repo_id} )
),

-- resolved once, instead of a correlated NOT EXISTS per branch (pull_requests.head_ref is unindexed)
open_pr_branches AS (
  SELECT DISTINCT pr.base_repo_id, pr.head_ref
  FROM pull_requests pr
  JOIN scoped_repos sr ON sr.id = pr.base_repo_id
  WHERE pr.status = 'OPEN'
    AND pr.head_ref IS NOT NULL
),

branch_tips AS (
  SELECT
    rf.repo_id,
    -- gitextractor stores remote refs as 'origin/<name>'; normalise to the short branch name
    CASE WHEN rf.name LIKE 'origin/%' THEN SUBSTRING(rf.name, 8) ELSE rf.name END AS branch_name,
    MAX(rf.is_default) AS is_default,
    MAX(COALESCE(c.committed_date, c.authored_date)) AS last_commit_date
  FROM refs rf
  JOIN scoped_repos sr ON sr.id = rf.repo_id
  JOIN commits c       ON c.sha = rf.commit_sha
  WHERE rf.ref_type = 'BRANCH'
    AND rf.name <> 'origin/HEAD'
  GROUP BY rf.repo_id, branch_name
)

SELECT COUNT(*) AS 'Stale Branches'
FROM branch_tips bt
LEFT JOIN open_pr_branches ob
  ON  ob.base_repo_id = bt.repo_id
  AND ob.head_ref     = bt.branch_name
WHERE bt.is_default = 0
  AND ob.head_ref IS NULL
  AND bt.last_commit_date < DATE_SUB(NOW(), INTERVAL 30 DAY)   -- staleness threshold
