-- Per-developer scorecard that joins four independent aggregates on account id: commit volume, PR-commit contributions, reviews given, and PRs authored.
WITH scoped_prs AS (
  SELECT pr.id, pr.author_id, pr.status, pr.created_date
  FROM pull_requests pr
  WHERE pr.base_repo_id IN ( ${repo_id} )
    AND pr.base_repo_id IN (
      SELECT pm.row_id FROM project_mapping pm
      WHERE pm.`table` = 'repos'
        AND pm.project_name IN ( ${project} ))
    AND $__timeFilter(pr.created_date)
),

code_volume AS (
  SELECT c.author_email        AS email,
         COUNT(DISTINCT c.sha) AS commits,
         SUM(c.additions)      AS lines_added,
         SUM(c.deletions)      AS lines_deleted
  FROM commits c
  JOIN repo_commits rc ON rc.commit_sha = c.sha
   AND rc.repo_id IN ( ${repo_id} )
   AND rc.repo_id IN (
     SELECT pm.row_id FROM project_mapping pm
     WHERE pm.`table` = 'repos'
       AND pm.project_name IN ( ${project} ))
  WHERE $__timeFilter(c.authored_date)
    AND c.author_email IN ( ${developer_id} )
    AND NOT EXISTS (
      SELECT 1 FROM commit_parents cp
      WHERE cp.commit_sha = c.sha
      GROUP BY cp.commit_sha HAVING COUNT(*) > 1)
  GROUP BY c.author_email
),

contributed AS (
  -- pull_request_commits carries the author email directly, so no join back to commits
  SELECT prc.commit_author_email AS email,
         COUNT(DISTINCT CASE WHEN pr.status = 'MERGED' THEN pr.id END) AS prs_merged_contributed,
         COUNT(DISTINCT CASE WHEN pr.status = 'CLOSED' THEN pr.id END) AS prs_abandoned_contributed
  FROM scoped_prs pr
  JOIN pull_request_commits prc ON prc.pull_request_id = pr.id
  WHERE prc.commit_author_email IN ( ${developer_id} )
  GROUP BY prc.commit_author_email
),

reviewed AS (
  SELECT a.email,
         SUM(cmt.type = 'REVIEW' AND cmt.status = 'APPROVED')          AS approvals_given,
         SUM(cmt.type = 'REVIEW' AND cmt.status = 'CHANGES_REQUESTED') AS change_requests_given,
         SUM(cmt.type IN ('NORMAL','DIFF'))                            AS comments_given,
         COUNT(DISTINCT cmt.pull_request_id)                           AS prs_reviewed
  FROM pull_request_comments cmt
  JOIN scoped_prs pr ON pr.id = cmt.pull_request_id
                    AND cmt.account_id <> pr.author_id
  JOIN accounts a    ON a.id = cmt.account_id
                    AND a.email IN ( ${developer_id} )
  WHERE $__timeFilter(cmt.created_date)
  GROUP BY a.email
),

authored AS (
  SELECT a.email,
         COUNT(DISTINCT pr.id)                                         AS prs_opened,
         COUNT(DISTINCT CASE WHEN pr.status = 'MERGED' THEN pr.id END) AS prs_merged,
         COUNT(cmt.id)                                                 AS change_requests_received
  FROM scoped_prs pr
  JOIN accounts a ON a.id = pr.author_id
                 AND a.email IN ( ${developer_id} )
  LEFT JOIN pull_request_comments cmt
         ON cmt.pull_request_id = pr.id
        AND cmt.type       = 'REVIEW'
        AND cmt.status     = 'CHANGES_REQUESTED'
        AND cmt.account_id <> pr.author_id
  GROUP BY a.email
),

spine AS (
  SELECT email FROM code_volume
  UNION SELECT email FROM contributed
  UNION SELECT email FROM authored
  UNION SELECT email FROM reviewed
),

dev AS (
  -- one account per email; accounts.email is not unique, so collapse before resolving names
  SELECT a.email, MIN(a.id) AS account_id
  FROM accounts a
  WHERE a.id LIKE 'github:%'
    AND a.email IN ( ${developer_id} )
  GROUP BY a.email
)

SELECT REPLACE(COALESCE(
         NULLIF(TRIM(a.full_name),    ''),
         NULLIF(TRIM(a.user_name),    ''),
         NULLIF(TRIM(s.email),        ''),
         '(unmapped)'
       ), '-', ' ')                                  AS `Developer`,

       COALESCE(cv.commits,       0)                 AS `Commits`,
       COALESCE(cv.lines_added,   0)                 AS `Lines Added`,
       COALESCE(cv.lines_deleted, 0)                 AS `Lines Deleted`,
       COALESCE(co.prs_merged_contributed,    0)     AS `Commits Landed`,
       COALESCE(co.prs_abandoned_contributed, 0)     AS `Commits Abandoned`,

       COALESCE(au.prs_opened,               0)      AS `PRs Opened`,
       COALESCE(au.prs_merged,               0)      AS `PRs Merged`,
       COALESCE(au.change_requests_received, 0)      AS `Change Requests Received`,

       COALESCE(rv.prs_reviewed,          0)         AS `PRs Reviewed`,
       COALESCE(rv.approvals_given,       0)         AS `Approvals Given`,
       COALESCE(rv.change_requests_given, 0)         AS `Change Requests Given`,
       COALESCE(rv.comments_given,        0)         AS `Comments Given`

FROM spine s
LEFT JOIN dev          d  ON d.email = s.email
LEFT JOIN accounts     a  ON a.id = d.account_id
LEFT JOIN code_volume  cv ON cv.email = s.email
LEFT JOIN contributed  co ON co.email = s.email
LEFT JOIN authored     au ON au.email = s.email
LEFT JOIN reviewed     rv ON rv.email = s.email
ORDER BY `Developer`;
