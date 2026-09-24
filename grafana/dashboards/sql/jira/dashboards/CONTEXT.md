# Jira Grafana dashboards — context

Written 2026-09-21, **re-read against the JSONs on 2026-09-22**. Companion to
`../CONTEXT.md` (Jira plugin → domain-table pipeline; **read that first** for what the
data actually means) and `../../github/dashboards/CONTEXT.md` (the GitHub equivalents,
which several of these panels were ported from).

Status: this whole folder is **untracked** — `git status` shows `?? grafana/dashboards/sql/jira/dashboards/`.
Nothing here has ever been committed.

## The eight dashboards

| File | Title | uid | Panels | Template vars |
|---|---|---|---|---|
| `a. jira_high_level_summary.json` | A. Jira High Level Summary | `dfy7sh5aww35sc` | 35 top-level (4 rows; 3 collapsed rows hold 18 more) | project, board_id, developer_id |
| `b. ticket_delivery_and_flows.json` | B. Ticket Delivery and Flows | `ffxpy568h2mm8f` | 10 | project, board_id, label, issue_type, interval |
| `c. ticket_hygiene.json` | C. Ticket Hygiene | `afyj7pcwm99tsa` | 13 | project, board_id, developer_id |
| `d. tickets_overview.json` | D. Tickets Overview | `bfyfs8x6mh4owf` | 13 | project, board_id, developer_id, interval |
| `e. tickets_per_developer.json` | E. Tickets per Developer | `ffyfa6ezr5udcb` | 5 | project, board_id, developer_id, interval |
| `f. jira_basics.json` | F. Jira Basics | `ffyfvmn24mrcwb` | 21 | project, board_id, developer_id |
| `g. velocity_and_delivery.json` | G. Velocity and Delivery | `bfymtzee9gum8f` | 7 | project, board_id, developer_id, interval |
| `z. jira_ticket_grooming_dashboard.json` | Z. Jira Ticket Grooming Dashboard | `cfybfjtw5xc00c` | 5 | project, board_id, developer_id |

All eight: `schemaVersion: 41`, `editable: true`, no tags, no refresh, default time range
`now-30d → now`, no dashboard links, no repeats, no library panels. **B–G** each open with a
`text` panel titled `Dashboard <letter>` whose whole body is `# <dashboard name>`; A and Z have none.

**A is a superset dashboard.** Its collapsed `Ticket Hygiene Stats` row duplicates C's
metrics as piecharts/stats, its `Ticket Grooming` row duplicates Z, and its `Workload` row
(Above / Below Fair Share) exists nowhere else. Three rows — `Ticket Grooming`,
`Ticket Hygiene Stats` and `Workload` — are `collapsed: true`; only `Issues Stats` is open.

## Panel inventory (by dashboard)

- **A** — `Jira Issues Summary` (bargauge, **2 targets**: per-type counts filtered by
  `creator_id`, plus a `Total` filtered by `assignee_id`), `Priority Breakdown` (barchart,
  open tickets by priority, `'None'` bucket for blank), `Status Overview` (piechart,
  Done / In Progress / To Do), `Epic Progress` (barchart, see below), and the Bug / Stories /
  Tasks Status Distribution piecharts. ~25 stats: New Epics/Stories/Tasks Created,
  Bugs Reported / To Do / In Progress / Done / Unassigned, the same quartet for Stories and
  Tasks, Reopened Count, Reopen Percentage, Bugs Ratio (Kanban) and (Scrum), Average Bug
  Resolution / Task Completion / Story Completion Time (Days), Cycle Time. Plus the Grooming
  row (4), the Hygiene row (12, including `Tickets without Parent`) and the Workload row (2).
- **B** — Mean Issue Lead Time in days (p50/p85/p95 stat), Ticket Delivery Rate Over Time
  (the only sprint-based panel outside G), Tickets Delivery Stats, Issue Status
  Distribution, Work In Progress, Aging Work In Progress (table), Aging Work In Progress
  (Charted, 2 targets), p50 / p85 Aging WIP stats.
- **C** — story-point, estimate, in-progress and description hygiene: a monthly-distribution
  barchart per theme plus drill-down tables (Tickets without Story Points / above Threshold /
  without Estimates / Title Length below Threshold / In Progress with No Activity / In Progress
  without Assignee / without Description / Description Length below Threshold).
- **D** — Created VS Closed Trend, Ticket Type Mix Trend, Tickets Lead Time, Aging Work In
  Progress, Bugs Reported vs Tickets Delivered (Scrum) and (Kanban), plus **six priority
  tables**: Highest / High / Medium / Low / Lowest Priority Tickets and Tickets without
  Priority (`i.priority = ''`, not `IS NULL`).
- **E** — Tickets By Status, Current Work in Progress, Tickets Closed, Ticket Type Mix Per Developer.
- **F** — per-type allocation barcharts (Work Allocation by Tasks and Bugs, Bug / Story /
  Task allocation Done-vs-Pending) plus one table per bucket for Bugs, Epics, Stories and
  Tasks/Sub-Tasks, Average Time for Ticket Closure, and **Reopened Tickets** (the only
  `issue_status_history` panel outside B; it carries its own copy of B's `curated` status CTE).
- **G** — Headcount per Period, Throughput per Person, Headcount Trend, **Story Points
  Coverage per Sprint** (sprint commit vs delivered, `sprints`/`board_sprints`/`sprint_issues`),
  **Pre-release defects per release** and **Escaped defects per release** (both keyed on
  `issues.fix_versions`).
- **Z** — Ticket Grooming Misses Stats, Ticket with Grooming Issues Distribution, and one
  table each for Tickets without User Story / Acceptance Criteria / Context.

### A's `Epic Progress` (panel id 55)

The Jira-overview widget: one stacked horizontal bar per epic with its children counted into
To Do / In Progress / Done, status only — no story points or estimates. The epic of an issue is
found by walking `parent_issue_id` (= Jira's `fields.parent`) up to the first `EPIC`, capped at
depth 10, so sub-tasks are credited through their story; `epic_key` is only a fallback for
classic projects where the epic link is a custom field. Issues with no epic collapse into one
bar with an empty key and the title `None`. Top 20 epics by child count. Source of truth is
`../04. epic_progress.sql`.

## Template variables

The cascade is `project → board_id → {developer_id, issue_type, label}`. All query vars are
`multi: true` with `current: All`; `interval` is a `custom` var.

- `project` — `SELECT DISTINCT pm.project_name FROM project_mapping WHERE pm.table = 'boards' AND pm.row_id LIKE 'jira:%'`.
- `board_id` — `CONCAT(b.name, '--', b.id)` with regex `/^(?<text>.*)--(?<value>.*)$/`, filtered by `$project`.
- `developer_id` — the widest one: unions `issue_assignees.assignee_id`, `issues.creator_id`,
  `issue_changelogs.author_id` and `issue_worklogs.author_id` over the scoped boards, then
  renders `full_name → user_name → email → '(unmapped)'` as `Name--<account id>`. **The value
  is a domain account id**, and panels filter `i.assignee_id IN ($developer_id)` or
  `i.creator_id IN ($developer_id)` (72 references in total). This is the opposite of the GitHub
  dashboards, which moved to email matching — do not copy that idiom across.
- `issue_type` (B only) — declared in the JSON as `SELECT DISTINCT i.type`, i.e. the *standard*
  type, but B's panels filter `i.original_type IN ($issue_type)`. `../var. issue_type.sql`
  selects `original_type`, which is the correct one; **the JSON var is the stale/wrong side.**
- `label` (B only) — `issue_labels.label_name` over the scoped boards.
- `interval` (B, D, E, G) — custom `Month : 1M, Week : 1w, Day : 1d`. D, E and G now default to
  `1M`. **B's copy still defaults to `1m`** (lower-case = minutes in MySQL `$__timeGroup`), so
  B's interval-driven panels bucket by minute until the user picks another value.

`$project` is declared on every dashboard but referenced in panel SQL only 9 times — in A, B and
G's *Escaped defects per release*; elsewhere it only feeds the `board_id` query. Scoping is
otherwise done entirely through `board_issues.board_id IN ($board_id)` (50 references).

## Conventions

- **Datasource**: query panels use `{"type": "mysql", "uid": "devlake-mysql"}` — a named uid,
  not the local-machine uid the GitHub JSONs hardcode. `provisioning/datasources/datasource.yml`
  declares the datasource as `name: mysql` with **no uid**, so `devlake-mysql` does not resolve
  in a fresh container either. **16 of A's stat panels use `-- Dashboard --`** instead: the
  Bug/Story/Task To Do–In Progress–Done stats read off their piecharts, and the grooming and
  hygiene stats read off the bargauge/piecharts in their rows. Those stats have no SQL of their
  own — change the source panel and they follow. Annotation queries use `-- Grafana --`.
- **Scoping idiom**: `i.id LIKE 'jira:%'` + `EXISTS (SELECT 1 FROM board_issues bi WHERE bi.issue_id = i.id AND bi.board_id IN ($board_id))`.
  A few panels use a `JOIN board_issues` instead. 20 panels still write `LIKE '%jira:%'`
  with a leading wildcard — harmless here but it defeats the index.
- **Epics** are excluded nearly everywhere via `i.type <> 'EPIC'` (26 uses) or
  `COALESCE(i.original_type,'') <> 'Epic'`. `Epic Progress` and F's *Epics Created* are the
  exceptions that want them.
- **Time**: `$__timeFilter()` (103 uses) on `created_date`, `resolution_date`, `started_date` or
  `shipped_at`; `$__timeGroup(col, $interval)` for trends; `$__timeFrom()/$__timeTo()` only in
  the recursive-day-series WIP panels.
- **Created-vs-closed panels** union two SELECTs with a zeroed column on each side, which is
  the repo-wide idiom.
- **Styling**: `color.mode` is `thresholds` on stats/tables and `palette-classic` on
  charts; legends are `list`/`bottom`; `custom.width: 100` overrides on table columns;
  transformations are mostly `filterFieldsByName`.
- **Links** come in two kinds. Table cells link out with `${__data.fields.Link}` (32 uses) —
  the SQL supplies a `Link` column — and stat/chart panels drill down to another dashboard.
  A is the hub with 38 links; F has 15, C 8, D 7, Z 3; B, E and G have none. All 38 drill-down
  URLs are **root-relative `/grafana/d/<uid>/...`** (made host-independent 2026-09-23; they used to
  hardcode `https://aperture.arbisoft.com`), so they work on any host that serves Grafana under
  `/grafana`. They still pin a `viewPanel=panel-N` id, so they break whenever a panel id is renumbered.
- Percentile panels compute p50/p85/p95 by hand with `ROW_NUMBER() OVER (...)` + `CEIL(q * cnt)`,
  because MySQL 5.7/8 has no `PERCENTILE_CONT`.
- **Recursive CTEs** are used for three different jobs: the day series in the WIP panels, the
  comma-split of `fix_versions` in G's *Pre-release defects*, and the parent-chain walk in A's
  *Epic Progress*. All of them require MySQL 8.

## Hardcoded thresholds

Baked into SQL, not template variables — change them in every panel at once or not at all:

- Story points: compliant `> 0 AND <= 13`, "above threshold" `> 13`.
- Description length: `CHAR_LENGTH(TRIM(i.description)) < 100`.
- Title length: `CHAR_LENGTH(TRIM(i.title)) < 15`.
- Stale in-progress: `DATEDIFF(CURDATE(), i.updated_date) > 14` days (A's hygiene stat, C, D).
- Workload fairness: `Overloaded` above `1.25 ×` the per-head average, `Underloaded` below
  `0.75 ×`; each table is `LIMIT 10`.
- Epic Progress: parent-chain depth cap `10`, `LIMIT 20` epics.
- Pre-release defects: the first release ever has no predecessor, so its window falls back to a
  `90`-day lookback.
- Grooming: `i.description LIKE '%user story%' / '%acceptance criteria%' / '%context%'`. Note
  `'%context%'` also matches the word "context" anywhere in prose, so "no Context heading"
  undercounts.
- WIP status taxonomy: a `curated` CTE hardcodes `In Progress → Active Work` and
  `In Review / Ready for QA / Blocked → Waiting`, falling back to the DevLake standard
  `IN_PROGRESS / TODO / DONE` split. Edit this list per team — and note it now exists in **two**
  places, B's WIP panels and F's *Reopened Tickets*.

## Relationship to the `.sql` files in `../`

Five `.sql` files exist (`01. work_in_progress`, `02. aging_work_in_progress`,
`03. aging_work_in_progress_chart`, `03b. aging_work_in_progress_thresholds`,
`04. epic_progress`). `01`–`03b` map to **B**, `04` maps to **A**; the other six dashboards have
no `.sql` counterpart, so for them the JSON is the only source.

- `03` and `03b` are byte-identical to the two targets of B's *Aging Work In Progress (Charted)*.
- `02` ≈ B's *Aging Work In Progress* table (ratio 0.98, whitespace only).
- `04` is byte-identical to A's *Epic Progress* (written 2026-09-22, file first, then the panel).
- `01` vs B's *Work In Progress*: the panel is Grafana-reformatted **and has dropped predicates** —
  `../01. work_in_progress.sql` also filters `pm.project_name IN ($project)` and
  `EXISTS (... issue_labels il ... il.label_name IN ($label))`, which the panel does not (it keeps
  only `$issue_type` and `$board_id`). So B declares `label` and uses it in another panel, but the
  WIP panel ignores it. The `.sql` file is the more correct version; **when editing, sync the
  panel to the file, not the reverse.**

## Known defects / traps

1. **`i.type` vs `i.original_type` are mixed inside a single dashboard.** In A, the Bug and
   Story panels match `i.original_type LIKE '%bug%'` while three Task panels still match
   `i.type LIKE '%task%'` — and `issues.type` holds the *standard* type (`BUG`, `TASK`,
   `STORY`, `SUBTASK`, `EPIC`), so `LIKE '%task%'` on it also swallows sub-tasks. (The worse
   variant, `i.type LIKE '%TASK'` in *Tasks Done*, has since been fixed.) The newer panels —
   Priority Breakdown, D's priority tables, E's *Ticket Type Mix Per Developer* — do it right
   with `i.type IN ('BUG','STORY','TASK','SUBTASK')`.
2. **`issue_status_history` is not a core domain table.** It comes from the separate
   `backend/plugins/issue_trace` plugin, so B's Work In Progress and Aging WIP panels, F's
   *Reopened Tickets* and `01`–`03b` return nothing unless that plugin has run. The `hist` CTE
   also re-ends each issue's last interval at `UTC_TIMESTAMP()` to work around `issue_trace`
   freezing `end_date` at conversion time.
3. **B's `interval` default is `1m` = one minute**, as above. D, E and G default to `1M` correctly.
4. **B's `issue_type` variable queries the wrong column** (`i.type`, while the panel filters
   `original_type`), as above.
5. **Descriptions on A's stat panels are copy-pasted and wrong** — a dozen panels including
   *Bugs Done* and *Average Bug Resolution Time* all say "Counts non-bug issues created in the
   window". Do not trust a panel's description over its SQL.
6. **G ignores `$developer_id`** although it declares it — all seven panels, old and new. Its
   *Headcount per Period* and *Throughput per Person* also compute from
   `COUNT(DISTINCT i.assignee_id)` bucketed by `created_date` while filtering `status = 'DONE'`,
   i.e. they bucket delivered work by when it was *created*, not resolved.
7. **B's *Ticket Delivery Rate Over Time* is unscoped** — it filters only `s.id LIKE 'jira:%'`,
   with no `$board_id` predicate, so it reports across every Jira board regardless of the picker.
   Sprint-based, so it is empty for Kanban boards — as are G's sprint and release panels.
8. **G's two release panels disagree on what a release is.** *Pre-release defects* explodes
   `fix_versions` into one row per version with a recursive CTE; *Escaped defects* groups on the
   raw comma-joined string, so an issue fixed in `1.4.0,1.5.0` becomes its own third "release".
   Both also define a release's ship date as `MAX(resolution_date)` of its issues, which is a
   proxy, not a real release date — DevLake has no release table for Jira.
9. **A's 16 `-- Dashboard --` stats have no SQL.** They re-slice another panel's result, so they
   silently inherit that panel's filters and go blank if the source panel is renamed or deleted.
10. `dashboard uid`s are Grafana-generated slugs, not human-readable — keep them stable across
    re-exports or saved links break.
11. Provisioning copies all of `grafana/dashboards` into the image with
    `foldersFromFilesStructure: true`, so once these are committed they auto-provision as a
    "dashboards" folder nested under the sql/jira path.
