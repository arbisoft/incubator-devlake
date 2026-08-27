-- Per-developer scorecard that joins four independent aggregates on account id: commit volume, PR-commit contributions, reviews given, and PRs authored.
WITH scoped_repos AS (
  SELECT r.id
  FROM repos r
  WHERE r.id LIKE 'github:%'
  AND r.id IN ( ${repo_id} )
    AND EXISTS (SELECT 1 FROM project_mapping pm
                 WHERE pm.row_id  = r.id
                   AND pm.`table` = 'repos'
                   AND pm.project_name IN ( ${project} ))
),

scoped_prs AS (
  SELECT pr.id, pr.author_id, pr.status, pr.created_date
  FROM pull_requests pr
  JOIN scoped_repos sr ON sr.id = pr.base_repo_id
  WHERE pr.author_id IN ( ${developer_id} )
),

code_volume AS (
  SELECT c.author_id            AS account_id,
         COUNT(DISTINCT c.sha)  AS commits,
         SUM(c.additions)       AS lines_added,
         SUM(c.deletions)       AS lines_deleted
  FROM commits c
  JOIN repo_commits rc ON rc.commit_sha = c.sha
  JOIN scoped_repos sr ON sr.id = rc.repo_id
  WHERE $__timeFilter(c.authored_date)
  AND c.author_id IN ( ${developer_id} )
  GROUP BY c.author_id
),

contributed AS (
  SELECT c.author_id AS account_id,
         COUNT(DISTINCT CASE WHEN pr.status =  'MERGED' THEN pr.id END) AS prs_merged_contributed,
         COUNT(DISTINCT CASE WHEN pr.status <> 'MERGED' THEN pr.id END) AS prs_abandoned_contributed
  FROM scoped_prs pr
  JOIN pull_request_commits prc ON prc.pull_request_id = pr.id
  JOIN commits c                ON c.sha = prc.commit_sha
  WHERE $__timeFilter(pr.created_date)
  AND c.author_id IN ( ${developer_id} )
  GROUP BY c.author_id
),

reviewed AS (
  SELECT cmt.account_id,
         SUM(cmt.type = 'REVIEW' AND cmt.status = 'APPROVED')          AS approvals_given,
         SUM(cmt.type = 'REVIEW' AND cmt.status = 'CHANGES_REQUESTED') AS change_requests_given,
         SUM(cmt.type IN ('NORMAL','DIFF'))                            AS comments_given,
         COUNT(DISTINCT cmt.pull_request_id)                           AS prs_reviewed
  FROM pull_request_comments cmt
  JOIN scoped_prs pr ON pr.id = cmt.pull_request_id
  WHERE $__timeFilter(cmt.created_date)
  AND cmt.account_id IN ( $developer_id )
  GROUP BY cmt.account_id
),

authored AS (
  SELECT pr.author_id AS account_id,
         COUNT(DISTINCT pr.id)                                        AS prs_opened,
         COUNT(DISTINCT CASE WHEN pr.status = 'MERGED' THEN pr.id END) AS prs_merged,
         COUNT(cmt.id)                                                AS change_requests_received
  FROM scoped_prs pr
  LEFT JOIN pull_request_comments cmt
         ON cmt.pull_request_id = pr.id
        AND cmt.type       = 'REVIEW'
        AND cmt.status     = 'CHANGES_REQUESTED'
        AND cmt.account_id <> pr.author_id
  WHERE $__timeFilter(pr.created_date)
  AND pr.author_id IN ( $developer_id )
  GROUP BY pr.author_id
),

spine AS (
  SELECT account_id FROM code_volume
  UNION SELECT account_id FROM contributed
  UNION SELECT account_id FROM authored
  UNION SELECT account_id FROM reviewed
),

acct_user AS (
  SELECT account_id, MIN(user_id) AS user_id
  FROM user_accounts 
  WHERE account_id IN ( $developer_id )
  GROUP BY account_id
)

SELECT REPLACE(COALESCE(
         NULLIF(TRIM(MAX(u.name)),      ''),
         NULLIF(TRIM(MAX(a.full_name)), ''),
         NULLIF(TRIM(MAX(a.user_name)), ''),
         NULLIF(TRIM(MAX(a.email)),     ''),
         NULLIF(TRIM(MAX(u.email)),     ''),
         CONCAT('(unmapped: ', MAX(s.account_id), ')')
       ), '-', ' ')                                    AS `Developer`,

       COALESCE(SUM(code_volume.commits),       0)            AS `Commits`,
       COALESCE(SUM(code_volume.lines_added),   0)            AS `Lines Added`,
       COALESCE(SUM(code_volume.lines_deleted), 0)            AS `Lines Deleted`,
       COALESCE(SUM(co.prs_merged_contributed),    0)  AS `Commits Landed`,
       COALESCE(SUM(co.prs_abandoned_contributed), 0)  AS `Commits Abandoned`,

       COALESCE(SUM(au.prs_opened),      0)            AS `PRs Opened`,
       COALESCE(SUM(au.prs_merged),      0)            AS `PRs Merged`,
       COALESCE(SUM(au.change_requests_received), 0)   AS `Change Requests Received`,


       COALESCE(SUM(rv.prs_reviewed),          0)      AS `PRs Reviewed`,
       COALESCE(SUM(rv.approvals_given),       0)      AS `Approvals Given`,
       COALESCE(SUM(rv.change_requests_given), 0)      AS `Change Requests Given`,
       COALESCE(SUM(rv.comments_given),        0)      AS `Comments Given`

FROM spine s
LEFT JOIN accounts    a  ON a.id = s.account_id
LEFT JOIN acct_user   ua ON ua.account_id = a.id
LEFT JOIN users       u  ON u.id = ua.user_id
LEFT JOIN code_volume           ON code_volume.account_id = s.account_id
LEFT JOIN contributed co ON co.account_id   = s.account_id
LEFT JOIN authored    au ON au.account_id   = s.account_id
LEFT JOIN reviewed    rv ON rv.account_id   = s.account_id
GROUP BY COALESCE(u.id, a.id, s.account_id)
ORDER BY `Developer`