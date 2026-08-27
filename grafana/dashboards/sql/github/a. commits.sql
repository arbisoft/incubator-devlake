-- Counts each PR commit once per author, marking it Landed if any of its PRs merged and Abandoned if the PR closed unmerged, top 20 developers.
WITH _commit_logs AS (
    SELECT prc.commit_sha,
           MAX(CASE WHEN pr.status = 'MERGED'
                     AND pr.merged_date IS NOT NULL
                     AND pr.base_repo_id IS NOT NULL
                    THEN 1 ELSE 0 END) AS landed,
           MAX(CASE WHEN pr.status = 'CLOSED'
                     AND pr.merged_date IS NULL
                    THEN 1 ELSE 0 END) AS closed_unmerged,
           c.author_id as author_id,
           c.author_name as author_name
    FROM pull_request_commits prc
    JOIN pull_requests pr
      ON pr.id = prc.pull_request_id
      AND pr.base_repo_id in ( ${repo_id} )
    JOIN project_mapping pm 
      ON pm.row_id = pr.base_repo_id
      AND pm.table = 'repos'
      AND pm.project_name IN ( ${project} )
    JOIN commits c ON c.sha = prc.commit_sha
    WHERE prc.pull_request_id like 'github:%' 
      AND $__timeFilter(prc.commit_authored_date)
    GROUP BY prc.commit_sha, c.author_id, c.author_name
)

SELECT developer,
       SUM(_landed) AS Landed,
       SUM(_closed) AS Abandoned
FROM (
   SELECT 
      REPLACE(COALESCE(a.full_name, a.user_name, u.name,
                    cl.author_name, '(unmapped)'), '-', ' ') AS developer,
      COALESCE(cl.landed, 0) AS _landed,
      COALESCE(cl.closed_unmerged, 0) AS _closed
    FROM _commit_logs cl
    LEFT JOIN accounts a ON a.id = cl.author_id 
    LEFT JOIN (
        SELECT account_id, MIN(user_id) AS user_id
        FROM user_accounts
        GROUP BY account_id
    ) ua ON ua.account_id = a.id
    LEFT JOIN users u ON u.id = ua.user_id
) base
GROUP BY developer
ORDER BY (Abandoned + Landed) desc
LIMIT 20;
