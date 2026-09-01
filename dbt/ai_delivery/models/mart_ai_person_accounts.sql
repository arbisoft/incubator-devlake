{{ config(materialized='table') }}

-- One row per (AI person, DevLake account) — the identity map.
--
-- A single human routinely owns several rows in `accounts`: the source plugin's
-- row, the gitextractor twin keyed by commit email, sometimes a second platform.
-- This collects EVERY account belonging to an AI user's email so downstream
-- delivery can be summed across all of them (a person with PRs on two accounts
-- must not be undercounted). It is the `accts` CTE the dashboard used to compute
-- inline, materialised once per sync.
--
-- Sources, any of which may contribute an account:
--   1. ai_activities.account_id  — pre-resolved at convert time (one id only).
--   2. accounts.email match      — nothing for private GitHub profiles (email '').
--   3. org-plugin mapping        — users.email -> user_accounts -> accounts.id;
--                                  the only source that survives private emails.

WITH ai_emails AS (
    SELECT LOWER(user_email)             AS email,
           MAX(NULLIF(account_id, ''))   AS direct_account_id
    FROM {{ source('devlake', 'ai_activities') }}
    WHERE user_email <> ''
    GROUP BY 1
)

SELECT DISTINCT
       e.email      AS email,
       acc.id       AS account_id
FROM ai_emails e
JOIN {{ source('devlake', 'accounts') }} acc
  ON acc.id = e.direct_account_id
  OR LOWER(acc.email) = e.email
  OR acc.id IN (
       SELECT ua.account_id
       FROM {{ source('devlake', 'users') }} u
       JOIN {{ source('devlake', 'user_accounts') }} ua ON ua.user_id = u.id
       WHERE LOWER(u.email) = e.email
  )
