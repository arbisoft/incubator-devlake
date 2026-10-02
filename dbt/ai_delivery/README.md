# ai_delivery — precomputed identity & membership marts

dbt project that materialises the two per-sync-static joins the
**AI Usage + Delivery Correlation** dashboard (`uid ai_delivery_correlation`)
used to recompute on every panel refresh. Run once per sync, the dashboard then
reads small lookup tables instead of re-resolving identity at query time.

## Models (materialised as tables in the `lake` DB)

| Table | Grain | Purpose |
|---|---|---|
| `mart_ai_person_accounts` | (email, account_id) | Every DevLake account belonging to each AI user — so delivery sums across all of a person's accounts. |
| `mart_ai_project_members` | (project_name, email) | AI users who authored a PR in a project's repos — the membership scope for project panels. |

Both read DevLake domain tables declared as sources in `models/sources.yml`
(`ai_activities`, `accounts`, `users`, `user_accounts`, `pull_requests`,
`project_mapping`).

## How it runs

Executed by DevLake's **dbt plugin**. Wire it into a project's blueprint
`afterPlan` so it runs **after** github/org/dora populate accounts, PRs and
project_mapping:

```json
[[{ "plugin": "dbt",
    "options": {
      "projectPath": "dbt/ai_delivery",
      "projectName": "ai_delivery",
      "selectedModels": ["mart_ai_person_accounts", "mart_ai_project_members"]
    } }]]
```

The container needs the project files at `projectPath`. In production set
`projectGitURL` so the plugin clones them; for local dev bind-mount `./dbt` into
the devlake service.

## Run manually (local dev / verification)

```bash
docker cp dbt/ai_delivery <devlake_container>:/app/dbt/ai_delivery
docker exec -u root <devlake_container> chown -R devlake:devlake /app/dbt
docker exec <devlake_container> bash -c \
  "cd /app/dbt/ai_delivery && dbt run --profiles-dir . --project-dir ."
```

## Connection

`profiles.yml` targets MySQL via env vars (`MYSQL_HOST` default `mysql`,
`MYSQL_DATABASE` default `lake`, etc.), so the same file works in dev and prod.
The dbt-mysql adapter treats `schema` as the database; sources are fully
qualified as `lake.<table>` because the adapter connects without a default DB.
