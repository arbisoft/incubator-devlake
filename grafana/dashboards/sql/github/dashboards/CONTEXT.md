# GitHub Grafana Dashboards — Context

Scope: `grafana/dashboards/sql/github/dashboards/*.json` (7 exported Grafana dashboards) and how they
relate to the panel `.sql` files one level up in `grafana/dashboards/sql/github/`.

Branch: `feature/github-dashboards`. The JSONs were added in commit `d61c12b7e` ("dashboards jsons added").
Last verified: 2026-09-09.

---

## 1. What these files are

Seven Grafana dashboards, split out of the single legacy `../github_dashboard.json` (title `GitHub`,
uid `bfv2bypsu4kqoa`, 57 panels). Each new dashboard is a Grafana **export** — full JSON with
`schemaVersion: 41`, `editable: true`, its own `uid`, `version`, `templating`, and inline `rawSql`
per panel.

| File | Title | uid | Panels (SQL) | Default time | `interval` var |
|---|---|---|---|---|---|
| `a. github_high_level_summary.json` | A. GitHub High Level Summary | `efxmn9vz2bv28b` | 13 | `now-90d` | no |
| `b. contribution_overview.json` | B. Contribution Overview | `dfxmphb8rmupsd` | 6 | `now-6h` | no |
| `c. pr_health.json` | C. PR Health | `efxmt33dl16gwf` | 7 | `now-6h` | yes |
| `d. issue_overview.json` | D. Issue Overview | `cfxmvb4cu2gw0d` | 4 | `now-6h` | yes |
| `e. issues_per_developer.json` | E. Issues Per Developer | `efxmw34cjhszkc` | 4 | `now-6h` | yes |
| `f. delivery_metrics.json` | F. Delivery Metrics | `ffxmx2y33mayoa` | 6 | `now-6h` | yes |
| `g. work_distribution.json` | G. Work Distribution | `afxmxmufytf5sf` | 1 | `now-90d` | no |

41 SQL panels total. Every dashboard except `a.` and `g.` opens with a full-width (`w24 h3`) markdown
`text` panel titled `Dashboard <letter>` whose content is just `# <Dashboard Title>`.

**Letter shift vs. the legacy dashboard.** The legacy `github_dashboard.json` had inline section
headers `Dashboard A`…`Dashboard F` plus `Dashboard 0`. The split renumbered them: legacy's unlabeled
scorecard block became new **A**, legacy `Dashboard A` became new **B**, legacy `B`→**C**, `C`→**D**,
`D`→**E**, `E`→**F**, `F`→**G**. The text panels inside the new files still carry the *new* letter
(e.g. `b. contribution_overview.json` contains a panel titled `Dashboard B`), so they are consistent
internally — but any external reference to "Dashboard C" must state which numbering it means.

---

## 2. Panel → `.sql` file mapping

Panel titles are Title Case versions of the `.sql` basename (minus the `N. ` prefix). Exceptions
where the names do *not* line up mechanically:

| Panel title | `.sql` file |
|---|---|
| GitHub Issues Summary | `0. issues_summary.sql` |
| Average Task Completion Time (Days) | `0. avg_task_completion_time.sql` |
| Average Bug Resolution Time (Days) | `0. avg_bug_resolution_time.sql` |
| Contribution Detail | `a. contribution_details.sql` (file is plural) |
| Change Failure Rate | `e. chage_failure_rate.sql` (**typo in filename**) |
| Current Work In Progress | `d. current_wip.sql` |
| Roll-forward VS Rollback | `e. roll_forward_vs_rollback.sql` |

Full inventory, in dashboard render order:

**A. GitHub High Level Summary** — `GitHub Issues Summary` (piechart, x0 y0 w7 h8), then a 2×4 grid of
`stat` panels (w4 h4): `New Tasks Created`, `Tasks Done`, `Tasks In-Progress`, `Pending Tasks` on row
y0; `Bugs Reported`, `Bugs Done`, `Bugs In-Progress`, `Pending Bugs` on row y4. Bottom: two `stat`
panels `Average Task Completion Time (Days)` / `Average Bug Resolution Time (Days)` (x0, w7 h3) beside
two `table` panels `Workload Above Fair Share` / `Workload Below Fair Share` (w8 h6).

**B. Contribution Overview** — `Review Activity`, `Review Outcome Mix`, `Code Volume`, `Commits`
(barcharts), `Contribution Detail` (table), `Rework Rate` (barchart).

**C. PR Health** — `PR Outcomes`, `PR Acceptance Rate` (barchart), `Merge Time Trend`,
`Time To First Review` (timeseries), `PR Size` (barchart), `Open PR Aging`,
`PRs Merged Without Approval` (table).

**D. Issue Overview** — `Created VS Closed`, `Issue Type Mix` (timeseries), `Issue Lead Time`,
`Aging Work In Progress` (table).

**E. Issues Per Developer** — `Issues By Status` (barchart), `Current Work In Progress` (table),
`Issues Closed` (timeseries), `Issue Type Mix Per Developer` (table).

**F. Delivery Metrics** — all timeseries: `Deployment Frequency`, `Lead Time For Changes`,
`Change Failure Rate`, `Rollback Rate`, `Time To Rollback`, `Roll-forward VS Rollback`.

**G. Work Distribution** — `Task Weight Mix` (barchart, w24 h21). Only panel in the file.

### `.sql` files with no panel in this folder

These nine were part of the legacy dashboard's `Dashboard 0` (team allocation / contribution
leaderboards) plus one PR panel, and were **not** carried into the split. `G. Work Distribution`
holds only `Task Weight Mix`, so there is currently no home for them:

```
0. avg_time_for_issue_resolution.sql
0. contributions_by_commits.sql
0. contributions_by_line_changes.sql
0. contributions_by_pr.sql
0. contributions_by_pr_reviews.sql
0. monthly_contributions_by_pr.sql
0. tasks_allocation_done_pending_distribution.sql
0. work_allocation_by_tasks_and_bugs.sql
b. merge_time_distribution.sql
```

---

## 3. Template variables

All seven dashboards define the same three query variables (byte-identical SQL across files, verified
by hash), plus a custom `interval` on `c.`–`f.`:

| Name | Label | Type | multi | includeAll | Notes |
|---|---|---|---|---|---|
| `interval` | Time Interval | custom | no | no | `Month : 1m, Week : 1w, Day : 1d`; default `1m`. Absent from `a.`, `b.`, `g.` |
| `project` | Project | query | yes | yes | `SELECT DISTINCT pm.project_name FROM project_mapping WHERE table='repos' AND row_id LIKE 'github:%'` |
| `repo_id` | Repo | query | yes | yes | Emits `name--id`, regex `/^(?<text>.*)--(?<value>.*)$/`; depends on `$project` |
| `developer_id` | Developer | query | yes | yes | Emits `Display Name--<value>`, same regex; depends on `$repo_id` + `$project` |

`f. delivery_metrics.json` has **no `developer_id`** variable (DORA panels are repo-scoped only).

All `refresh: 1` (on dashboard load). Chained: `project` → `repo_id` → `developer_id`.

---

## 4. ⚠️ The JSONs are stale relative to the `.sql` files

The `.sql` files were migrated to **email-based developer filtering** (commit `28fc084be`, "all github
queries updated to account email filtering instead of account id") because
`commits.author_id` holds an email string, not an account id. **The dashboard JSONs were exported
before that migration and still use account ids.** 34 of 41 panels differ.

Two coupled halves of the drift:

**(a) The `developer_id` variable.** `../var. developer_id.sql` emits `... '--', a.email` and resolves
contributors through a `scoped_emails` CTE that also unions `commits.author_email`. The JSONs emit
`... '--', a.id` and have no `scoped_emails` step — so `$developer_id` interpolates account ids.

**(b) The panel predicates.** The `.sql` files filter on email, the JSONs on id:

| `.sql` (current) | JSON panel (stale) |
|---|---|
| `AND i.assignee_id IN (SELECT a.id FROM accounts a WHERE a.email IN ( $developer_id ))` | `AND i.assignee_id IN ( $developer_id )` |
| `JOIN accounts a ON a.id = pr.author_id AND a.email IN ( $developer_id )` | `... AND a.id IN ( $developer_id )` |
| `JOIN commits c ON c.sha = prc.commit_sha AND c.author_email IN ( $developer_id )` | `JOIN commits c ON c.sha = prc.commit_sha` + a separate `EXISTS (SELECT 1 FROM accounts a WHERE a.id IN ($developer_id) AND a.email = c.author_email)` |
| `a. code_volume`: `JOIN accounts a ON a.id = c.author_id AND a.email IN ($developer_id)` | `JOIN accounts a ON a.email = c.author_email AND a.id IN ($developer_id)` |

Because both halves are stale *consistently*, the exported dashboards are still internally coherent
(ids matched against ids) — they are not broken, just behind. The email form is the direction of
travel: it collapses a person's multiple GitHub accounts and picks up commit authorship that
`author_id` misses.

**When re-exporting: `.sql` files are the source of truth.** Copy the file content into the panel and
re-export, rather than editing SQL in the Grafana UI and losing the `.sql` edits.

### Panels that are already in sync (7)

`Workload Above Fair Share`, `Workload Below Fair Share`, `Rework Rate`, `Issues By Status`, and all
six of `f. delivery_metrics.json` — the DORA panels have no `developer_id` filter at all, so nothing
drifted.

### Two panels where the JSON is *ahead* of the `.sql` file

- `c. created_vs_closed.sql:16` has `JOIN accounts a ON a.id = i.assignee_id IN ( $developer_id )` —
  MySQL parses this as `a.id = (i.assignee_id IN (...))`, i.e. compares an id to a boolean, so the
  Closed series is always empty. The JSON has the corrected `a.id = i.assignee_id and a.id IN (...)`.
  **Fix the `.sql` file** (to the email form) rather than reverting the JSON.
- `d. current_wip.sql` uses `LEFT JOIN accounts a ... AND a.email IN (...)`, which does not filter
  (the predicate is in the `ON` clause of an outer join, so non-matching rows survive with NULL
  columns). The JSON uses an inner `JOIN`. The inner join is the intended semantics.

---

## 5. Datasource wiring — will not work in the provisioned container

Every SQL panel references:

```json
"datasource": { "type": "mysql", "uid": "P430005175C4C7810" }
```

That uid is generated by a specific local Grafana instance. The repo's `grafana/provisioning/datasources/datasource.yml`
declares the mysql datasource **without a `uid`**, so a fresh Grafana assigns a different one. Every
other dashboard in `grafana/dashboards/` uses the name reference `"datasource": "mysql"` (1608
occurrences) and none uses a mysql uid.

Also note the mixed state inside these files: `Workload Above/Below Fair Share` and `Rework Rate`
carry a panel-level datasource with `uid` but **no `type`**, while their targets carry the full
object. Grafana tolerates this but it is export noise.

**Before these ship**, either rewrite the panel/target datasources to `"mysql"`, or pin
`uid: P430005175C4C7810` in `datasource.yml`. The first matches repo convention.

### Provisioning path

`grafana/Dockerfile` does `COPY ./dashboards /etc/grafana/dashboards`, and
`provisioning/dashboards/dashboard.yml` sets `path: /etc/grafana/dashboards` with
`foldersFromFilesStructure: true` and `updateIntervalSeconds: 5`. So these JSONs **are** picked up
automatically and land in a Grafana folder derived from the directory structure
(`sql/github/dashboards`). The sibling `.sql` files are copied into the image too but ignored by
Grafana. The legacy `../github_dashboard.json` is also still provisioned — it duplicates all 41 panels
under a different uid, so the same panels appear twice in the Grafana UI until it is removed.

---

## 6. Panel styling conventions in these files

- Every target: `"format": "table"`, `"editorMode": "code"`, `"rawQuery": true`.
- Every panel has a `description` — a one-sentence plain-English restatement of what the SQL computes.
  These mirror the `-- ` header comments in the `.sql` files. Keep both in sync when editing a query.
- Layout: all of `b.`–`g.` are single-column, `w: 24` full-width panels stacked vertically. Only `a.`
  uses a multi-column grid.
- **barchart** panels: `orientation: horizontal`, `xTickLabelRotation: 0` (except `PR Acceptance Rate`
  at `-30`, and `PR Size` at `orientation: auto`), legend `displayMode: list`.
- **timeseries** panels: `stacking.mode: none`, except `Roll-forward VS Rollback` which uses `normal`.
- No panel uses `transformations` — all shaping happens in SQL.
- `fieldConfig.overrides` are used sparingly and only for presentation:
  - `custom.width` on table columns (`Contribution Detail` sets 4 column widths; `Open PR Aging` sets
    `Repository` to 224).
  - Percentage series pushed to a right-hand axis with `unit: percent` — `Change/Failure Rate`,
    `Rollback%` (in both `Rollback Rate` and `Roll-forward VS Rollback`), plus `Rollbacks` getting a
    `Count` axis label in `Time To Rollback`.
  - `custom.hideFrom.viz` to hide a helper series (`Total PRs` in `Task Weight Mix`) or a
    `__systemRef: hideSeriesFrom` leftover from UI clicking (`Merge Time Trend` — hides everything
    except `Median`; this is accidental UI state, probably worth clearing).
  - `Rework Rate` has an override on `row_id` with an **empty `properties` array** — dead export noise.

---

## 7. Known SQL defects (carried from the `.sql` files into the panels)

These are in the queries themselves, independent of the id/email drift. Reported but not yet fixed:

1. `b. pr_outcomes.sql` counts `pr.status = 'DRAFT'`. The domain enum is only `OPEN`/`CLOSED`/`MERGED`;
   draft is the separate `is_draft` bool. The `Draft` series in `PR Outcomes` is always 0.
2. `0. bugs_done` / `tasks_done` / `bugs_in_progress` / `tasks_in_progress` filter
   `i.status IN ('TODO','DONE','Closed')`. `'Closed'` is not a domain status (that is
   `original_status`), and counting `'TODO'` as done is wrong.
3. The GitHub plugin's `issue_convertor.go` sets `issues.status` to `DONE` if the GitHub state is
   `CLOSED` else `TODO` — it can **never** produce `IN_PROGRESS`. So `Bugs In-Progress`,
   `Tasks In-Progress`, and the "In Progress" series of `Issues By Status` are structurally always 0.
4. `e. chage_failure_rate.sql` comments that incidents have no repo link; `incidents` does have
   `table` + `scope_id`, so it could be scoped properly instead of attributing by time window.
5. `b. prs_merged_without_approval.sql` filters `prc.type IN ('APPROVED')`. `type` is only
   `NORMAL`/`DIFF`/`REVIEW`; approval lives in `status`. The panel reports 100% unapproved always.
   Fix: `prc.type = 'REVIEW' AND prc.status = 'APPROVED'`.
6. `d. issue_type_mix_per_developer.sql` selects `tm.category = 'Other'`, but that CTE's `ELSE` label
   is `'Unclassified'` — the `Other` column is always 0. Its `Planned` column is also always 0
   (the GitHub plugin produces no sprints).
7. `Code Volume` and every line-count panel read 0 unless the connection enables **Collect Commit
   Stats** (`EnabledByDefault: false`). Likewise `commit_parents` is only written by
   gitextractor/refdiff, never by the github plugin — so the merge-commit exclusions in
   `Code Volume`, `Contribution Detail` and `Task Weight Mix` are no-ops.
8. `accounts.email` is the GitHub profile's *public* email and is blank when a user hides it. Those
   people silently drop out of `var. developer_id` and therefore out of every panel.

See the top-level notes on `grafana/dashboards/sql/github/` for the full DevLake schema reference and
the shared SQL idioms (scoping pattern, display-name COALESCE chain, `CUME_DIST` percentiles,
`type_map` bucketing).
