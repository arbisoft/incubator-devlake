{{ config(materialized='table') }}

-- One row per (project, week, author, is_ai_adopter) — the quality-variance engine.
--
-- Each project commit is attributed to its author and week, and flagged
-- is_ai_adopter = 1 when that author (as a resolved person) had ANY ai_activities
-- in the same week. This is the honest "human vs AI-augmented" split the design
-- calls for: it compares the churn/rework of people who WERE using an AI tool that
-- week against people who were NOT — it does NOT claim any individual line was
-- AI-written (the schema has no commit-level AI key). "AI-augmented author" ≠
-- "AI-written code".
--
-- Churn = additions + deletions. Rework proxy = deletions (removal of existing
-- code), reported as a ratio downstream. Commits reach a project via
-- repo_commits -> project_mapping(table='repos'). Author identity is resolved
-- through mart_ai_person_accounts so a person's several accounts collapse to one
-- email; authors with no AI-person match are non-adopters by construction.

WITH project_commits AS (
    -- Commit -> project, de-duplicated per (commit, project): a repo maps to at
    -- most one project row here, but a commit can belong to several repos.
    SELECT DISTINCT
           pm.project_name AS project_name,
           c.sha           AS sha,
           c.author_id     AS author_id,
           c.author_email  AS author_email,
           c.additions     AS additions,
           c.deletions     AS deletions,
           DATE_SUB(DATE(c.authored_date), INTERVAL WEEKDAY(c.authored_date) DAY) AS week
    FROM {{ source('devlake', 'commits') }} c
    JOIN {{ source('devlake', 'repo_commits') }} rc ON rc.commit_sha = c.sha
    JOIN {{ source('devlake', 'project_mapping') }} pm
      ON pm.row_id = rc.repo_id
     AND pm.`table` = 'repos'
    WHERE c.authored_date IS NOT NULL
),

-- Resolve each commit author to a person email via the identity mart. LEFT JOIN:
-- a non-AI author (no mart row) keeps a NULL person_email and stays a non-adopter.
authored AS (
    SELECT pc.*,
           pa.email AS person_email
    FROM project_commits pc
    LEFT JOIN {{ ref('mart_ai_person_accounts') }} pa
      ON pa.account_id = pc.author_id
),

-- The set of (person, week) in which that person had any AI activity.
ai_active_person_week AS (
    SELECT DISTINCT
           LOWER(user_email) AS email,
           DATE_SUB(DATE(date), INTERVAL WEEKDAY(date) DAY) AS week
    FROM {{ source('devlake', 'ai_activities') }}
    WHERE user_email <> ''
),

flagged AS (
    SELECT a.project_name,
           a.week,
           -- Grain identity: the resolved person where known, else the raw commit email.
           COALESCE(a.person_email, LOWER(a.author_email)) AS author_email,
           a.sha,
           a.additions,
           a.deletions,
           CASE WHEN ap.email IS NOT NULL THEN 1 ELSE 0 END AS is_ai_adopter
    FROM authored a
    LEFT JOIN ai_active_person_week ap
      ON ap.email = a.person_email
     AND ap.week  = a.week
)

SELECT project_name,
       week,
       author_email,
       is_ai_adopter,
       COUNT(DISTINCT sha)     AS commits,
       SUM(additions)          AS additions,
       SUM(deletions)          AS deletions,
       SUM(additions + deletions) AS churn
FROM flagged
GROUP BY project_name, week, author_email, is_ai_adopter
