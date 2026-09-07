-- Template variable query for ${developer_id}: lists only developers who actually contributed to the selected repos within the selected project. Emits `Display Name--email` for the /^(?<text>.*)--(?<value>.*)$/ regex, so the value matches the `a.email IN ( $developer_id )` joins used by the panels.
WITH scoped_repos AS (
  SELECT r.id
  FROM repos r
  WHERE r.id LIKE 'github:%'
    AND r.deleted = 0
    AND r.id IN ( ${repo_id} )
    AND EXISTS (SELECT 1 FROM project_mapping pm
                 WHERE pm.row_id  = r.id
                   AND pm.`table` = 'repos'
                   AND pm.project_name IN ( ${project} ))
),

scoped_accounts AS (
  -- PR authors
  SELECT pr.author_id AS account_id
  FROM pull_requests pr
  JOIN scoped_repos sr ON sr.id = pr.base_repo_id

  UNION

  -- reviewers and commenters
  SELECT cmt.account_id
  FROM pull_request_comments cmt
  JOIN pull_requests pr ON pr.id = cmt.pull_request_id
  JOIN scoped_repos sr  ON sr.id = pr.base_repo_id

  UNION

  -- issue assignees, scoped through boards (github board ids match repo ids)
  SELECT ia.assignee_id
  FROM issue_assignees ia
  JOIN board_issues bi ON bi.issue_id = ia.issue_id
  WHERE bi.board_id IN ( ${repo_id} )
    AND EXISTS (SELECT 1 FROM project_mapping pm
                 WHERE pm.row_id  = bi.board_id
                   AND pm.`table` = 'boards'
                   AND pm.project_name IN ( ${project} ))
),

scoped_emails AS (
  SELECT a.email
  FROM accounts a
  JOIN scoped_accounts sa ON sa.account_id = a.id

  UNION

  -- commit authors carry the email directly, since commits.author_id is unreliable
  SELECT c.author_email
  FROM commits c
  JOIN repo_commits rc ON rc.commit_sha = c.sha
  JOIN scoped_repos sr ON sr.id = rc.repo_id
)

SELECT CONCAT(
         REPLACE(COALESCE(
           NULLIF(TRIM(a.full_name), ''),
           NULLIF(TRIM(a.user_name), ''),
           NULLIF(TRIM(a.email),     ''),
           '(unmapped)'
         ), '-', ' '),
         '--', a.email) AS Name
FROM accounts a
JOIN scoped_emails se ON se.email = a.email
WHERE a.id LIKE 'github:%'
  AND a.email IS NOT NULL
  AND a.email <> ''
GROUP BY Name
ORDER BY Name;
