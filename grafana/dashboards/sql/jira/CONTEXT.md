# Jira Plugin Pipeline — Context for Dashboard SQL

Source read: `backend/plugins/jira/` (47 files in `tasks/`, plus `impl/`, `models/`, `api/`,
`tasks/apiv2models/`). Written for whoever authors the Grafana panel SQL in this folder — the focus is
**what actually lands in the domain-layer tables and what you can trust when querying them**.

Last verified: 2026-09-09. Companion: `../github/dashboards/CONTEXT.md` for the GitHub side.

---

## 1. Pipeline shape

DevLake's three-stage pattern, per subtask:

```
Jira REST API  ──collect──▶  _raw_jira_api_*   ──extract──▶  _tool_jira_*   ──convert──▶  domain tables
```

**The unit of work is a board, not a project.** `JiraOptions` is `{connectionId, boardId, scopeConfig,
scopeConfigId, pageSize}` and `DecodeAndValidateTaskOptions` rejects a zero `boardId`. Every raw row is
tagged `_raw_data_params = {"ConnectionId":N,"BoardId":M}`, and nearly every convertor joins through
`_tool_jira_board_issues` to restrict to the board being processed. One pipeline task per board.

`pageSize` is clamped to 100 (`impl.go` — anything `<=0` or `>100` becomes 100).

### Subtask execution order (`impl/impl.go SubTaskMetas()`)

Order matters — several stages read tool-layer tables that an earlier stage populates.

1. `collectIssueFields` / `extractIssueFields` — **first**, because the issue extractor needs the field
   map to know which custom fields are of schema type `user`.
2. `collectBoardFilterBegin` — JQL guard (see §6).
3. `collectStatus` / `extractStatus`
4. `collectProjects` / `extractProjects`
5. `collectIssueTypes` / `extractIssueTypes` — needed before `extractIssues` (type id → name).
6. `collectIssues` / `extractIssues` — the fan-out hub (see §3).
7. `convertIssueLabels`
8. `collectIssueComments` / `extractIssueComments`
9. `collectIssueChangelogs` / `extractIssueChangelogs`
10. `collectWorklogs` / `extractWorklogs`
11. `collectRemotelinks` / `extractRemotelinks`
12. `collectSprints` / `extractSprints`
13. `collectEpics` / `extractEpics`
14. `collectAccounts`
15. `convertBoard`
16. `convertIssues`, `convertIssueComments`, `convertWorklogs`, `convertIssueChangelogs`,
    `convertIssueRelationships`
17. `convertSprints`, `convertSprintIssues`
18. `collectDevelopmentPanel` / `extractDevelopmentPanel`
19. `convertIssueCommits`, `convertIssueRepoCommits`
20. `extractAccounts`, `convertAccounts` — **last**, because accounts are discovered as a side effect of
    issue/changelog extraction.
21. `collectBoardFilterEnd` — JQL guard again.

### Disabled by default

Only three, and they are the comment chain:

| Subtask | `EnabledByDefault` |
|---|---|
| `collectIssueComments` | **false** |
| `extractIssueComments` | **false** |
| `ConvertIssueComments` | **false** |

⚠️ **`ticket.issue_comments` is empty unless the connection explicitly enables comments.** Do not build
a panel on it without checking. (Note the inconsistent meta name — `ConvertIssueComments` is
capitalised where every other one is lowerCamel; likewise `ExtractDevelopmentPanel`, and
`collectIssuleField` is a typo for `collectIssueField`.)

Everything else is `EnabledByDefault: true`.

### Domain-type tags

Subtasks are tagged `DOMAIN_TYPE_TICKET`, `DOMAIN_TYPE_CROSS`, or both; the blueprint filters by
`scopeConfig.Entities`, so a connection scoped to TICKET only will skip the CROSS-only subtasks —
`collectAccounts`, `extractAccounts`, `convertAccounts`, `convertIssueCommits`,
`convertIssueRepoCommits`, `ConvertIssueComments`. **If a connection is TICKET-only, `accounts` gets no
Jira rows** and any join from `issues.assignee_id` to `accounts` comes back empty. The two board-filter
guards are tagged `plugin.DOMAIN_TYPES` (all), so they always run.

---

## 2. Domain IDs

`didgen` builds `<plugin>:<StructName>:<pk...>` from the tool model's primary keys. All Jira tool
models are keyed `(ConnectionId, <entityId>)`, so:

| Domain column | Format | Example |
|---|---|---|
| `issues.id`, `board_issues.issue_id`, … | `jira:JiraIssue:<connectionId>:<issueId>` | `jira:JiraIssue:1:10023` |
| `boards.id`, `board_issues.board_id` | `jira:JiraBoard:<connectionId>:<boardId>` | `jira:JiraBoard:1:42` |
| `accounts.id`, `issues.assignee_id`, `issues.creator_id` | `jira:JiraAccount:<connectionId>:<accountId>` | `jira:JiraAccount:1:5b10a2…` |
| `sprints.id`, `sprint_issues.sprint_id` | `jira:JiraSprint:<connectionId>:<sprintId>` | `jira:JiraSprint:1:7` |
| `issue_worklogs.id` | `jira:JiraWorklog:<connectionId>:<issueId>:<worklogId>` | |
| `issue_changelogs.id` | `jira:JiraIssueChangelogItems:<connectionId>:<changelogId>:<field>` | |

So the Jira analogue of the GitHub dashboards' `LIKE 'github:%'` filter is **`LIKE 'jira:%'`**.

⚠️ **`<connectionId>` is embedded in every id.** Two Jira connections pointing at the same instance
produce completely disjoint id spaces for the same underlying issues. Scope panels by
`project_mapping` (as the GitHub panels do) rather than assuming one connection.

**Jira board id == board id only.** Unlike GitHub — where board ids and repo ids are the same string
because both come from `didgen(GithubRepo)` — Jira has no repo concept. `boards` is the only scope
table, and `project_mapping.table = 'boards'`.

---

## 3. `extractIssues` — the fan-out hub

`tasks/issue_extractor.go` → `extractIssues()` is where most of the tool layer gets written. From a
single `/rest/agile/1.0/board/{id}/issue?expand=changelog` response row it emits:

- `_tool_jira_issues` (one row)
- `_tool_jira_board_issues` (board ↔ issue link)
- `_tool_jira_sprint_issues` (from `fields.sprint` + `fields.closedSprints`)
- `_tool_jira_issue_labels` (one per `fields.labels` entry)
- `_tool_jira_issue_relationships` (one per `fields.issuelinks`)
- `_tool_jira_issue_comments`, `_tool_jira_worklogs`, `_tool_jira_issue_changelogs`,
  `_tool_jira_issue_changelog_items` — **inlined from the issue payload**
- `_tool_jira_accounts` — creator, reporter, assignee, plus every user found in changelog items

That inlining is important: the standalone comment/worklog/changelog **collectors only fetch the
overflow**. Their input cursors filter on
`i.changelog_total > 100`, `i.comment_total > 100`, `i.worklog_total > 20` respectively (and
`std_type != 'Epic'`). Issues under those thresholds never get a separate API call — their children
came in with the issue itself. Consequence: **changelogs and worklogs are populated even though their
dedicated collectors touch only a handful of issues.** Comments are the exception, since their
convertor is off by default.

Also set here:

- `lead_time_minutes` = `(resolution_date − created) / 60`, **computed only when `resolution_date` is
  non-null**. Wall-clock, not working time.
- `story_point` — read from the arbitrary custom field named by `scopeConfig.StoryPointField`; parsed
  from string or float, silently `0` if the field is unset or unparseable.
- `due_date` — from `scopeConfig.DueDateField`, defaulting to the standard `"duedate"`.
- `components` and `fix_versions` — **comma-joined name strings**, not relations.
- `is_subtask` = `fields.issuetype.subtask`.
- Issues with a null `fields.created` are **dropped entirely** (`return results, nil` early).

`ExtractEpics` reuses the exact same `extractIssues()` function against the `_raw_jira_api_epics`
table, so epics land in the same tool tables. That is why `convertIssues`' non-incremental cleanup
deletes rows whose `_raw_data_table` is `_raw_jira_api_issues` **or** `_raw_jira_api_epics`.

---

## 4. Status and type mapping — the part that differs most from GitHub

### Status

`tasks/shared.go`:

```go
func getStdStatus(statusKey string) string {
    if statusKey == "done" { return ticket.DONE }
    else if statusKey == "new" { return ticket.TODO }
    else { return ticket.IN_PROGRESS }
}
```

`statusKey` is Jira's **status *category* key** (`fields.status.statusCategory.key`), which Jira
constrains to `new` / `indeterminate` / `done`.

> **This is the single biggest difference from the GitHub plugin.** GitHub's `issue_convertor.go` only
> ever emits `DONE` or `TODO`, which makes every "In Progress" panel on the GitHub dashboards
> structurally always 0. **Jira genuinely produces `IN_PROGRESS`** — anything not in the `new` or
> `done` category. So `issues.status = 'IN_PROGRESS'` is a real, useful predicate here.

A per-type override exists: `scopeConfig.TypeMappings[<type>].StatusMappings[<statusKey>].StandardStatus`
wins over `getStdStatus` when configured.

`issues.original_status` = `fields.status.name` — the human status label ("In Review", "Blocked"),
free text per Jira workflow.

### Type

```go
issue.Type      = mappings.TypeIdMappings[issue.Type]   // type id → type NAME
issue.StdType   = mappings.StdTypeMappings[issue.Type]  // NAME → configured standard type
if issue.StdType == "" { issue.StdType = strings.ToUpper(issue.Type) }
```

Then `convertIssues` maps `StdType → issues.type` and `Type → issues.original_type`.

So for Jira:

- **`issues.original_type` = the Jira issue type name** — `Bug`, `Story`, `Task`, `Epic`, `Sub-task`.
- **`issues.type` = the configured standard type, else the uppercased type name** — so with no
  `TypeMappings` configured you get `BUG`, `STORY`, `TASK`, `EPIC`, unconstrained by the
  `ticket` enum.

> Again a sharp contrast with GitHub, where `original_type` is a **comma-joined list of label names**
> and the GitHub panels have to do `LOWER(original_type) LIKE '%bug%'` and keyword-bucket via a
> `type_map` CTE. **For Jira, prefer exact matching on `original_type`** (`original_type = 'Bug'`), or
> `type = 'BUG'` if type mappings are configured. Reusing the GitHub `type_map` CTE here would work but
> is doing keyword archaeology on data that is already clean.

One override in `convertIssues`: if no type mapping is configured **and** the issue is a subtask,
`issues.type` is forced to `ticket.SUBTASK`.

### Priority

`issues.priority` = `fields.priority.name` (`Highest`/`High`/…). Populated properly — unlike GitHub,
where it only exists if a label matches a configured regex.

---

## 5. What each domain table gets

| Domain table | From | Notes for SQL |
|---|---|---|
| `boards` | `convertBoard` | `name`, `url` (= API `self` URL, not the browse URL), `type` (`scrum`/`kanban`) |
| `board_issues` | `convertIssues` | board ↔ issue |
| `issues` | `convertIssues` | see below |
| `issue_assignees` | `convertIssues` | **only one row per issue** — Jira has a single assignee. Emitted only when `assignee_account_id != ''` |
| `issue_labels` | `convertIssueLabels` | one row per Jira label |
| `issue_relationships` | `convertIssueRelationships` | `original_type` = the link's `inward`/`outward` phrase ("blocks", "is blocked by"). Direction: inward id wins when non-zero, else outward |
| `issue_changelogs` | `convertIssueChangelogs` | rich — see below |
| `issue_comments` | `ConvertIssueComments` | **off by default**, and its `DomainEntity.Id` is set to the *issue* id, not a comment id — so multiple comments on one issue collide on primary key and only one survives. Treat as unusable |
| `issue_worklogs` | `convertWorklogs` | `time_spent_minutes` = seconds/60, `started_date`, `logged_date` |
| `sprints` | `convertSprints` | `status` = UPPER(state) → `ACTIVE`/`CLOSED`/`FUTURE`; `started_date`, `ended_date`, `completed_date` all real |
| `board_sprints`, `sprint_issues` | `convertSprints`, `convertSprintIssues` | ⚠️ `convertSprintIssues` filters on **connection only**, not board — it converts every sprint-issue pair on the connection on each board's run |
| `accounts` | `convertAccounts` | `full_name` and `user_name` are **both** set to `jiraAccount.Name` (= Jira `displayName`); `email` from `emailAddress` |
| `issue_commits`, `issue_repo_commits` | `convertIssueCommits`, `convertIssueRepoCommits` | issue ↔ commit SHA links, see §7 |

### `issues` columns worth knowing

`convertIssues` populates: `url` (rewritten to the human `/browse/<KEY>` form by `convertURL`),
`icon_url`, `issue_key`, `title` (= summary), `description`, `epic_key`, `type`, `original_type`,
`status`, `original_status`, `story_point`, `original_estimate_minutes`, `resolution_date`,
`priority`, `created_date`, `updated_date`, `lead_time_minutes`, `time_spent_minutes`,
`time_remaining_minutes`, `original_project` (= Jira project **name**), `component`, `is_subtask`,
`due_date`, `fix_versions`, `creator_id`, `creator_name`, `assignee_id`, `assignee_name`,
`parent_issue_id`.

`original_project` is a nice handle: it lets a panel group by Jira project **within** a board without
joining anything, since a board's filter can span projects.

`description` handles both plain text and Atlassian Document Format — `FlexibleDescription`
recursively flattens ADF to text (paragraphs, lists as `• `, tables as ` | `, code fences).

### `issue_changelogs` — the strongest Jira-only asset

`convertIssueChangelogs` writes one row per changed field per changelog entry, with
`field_name`, `original_from_value`, `original_to_value`, `author_id`, `author_name`, `created_date`.
Field-specific handling:

- `field_name = 'status'` — `original_from_value`/`original_to_value` get the status **names**, and
  `from_value`/`to_value` get the **standard** status via `getStdStatus`. This is the table to use for
  real cycle-time / time-in-status analysis (e.g. first transition into `IN_PROGRESS`), which the
  GitHub data simply cannot support.
- `field_name IN ('assignee','reporter')` — from/to values are rewritten into **domain account ids**.
- `field_name = 'Sprint'` — comma-separated sprint ids rewritten into **domain sprint ids** (sprint
  add/remove history, i.e. scope churn).
- any custom field whose schema type is `user` — also rewritten to domain account ids.

⚠️ `collectIssueChangelogs` and `extractIssueChangelogs` **return early and do nothing on Jira
Server** (`DeploymentType == DeploymentServer`); only the ≤100 inlined ones from the issue payload
survive there. Same for the comment collector/extractor.

---

## 6. Board filter (JQL) guard

`collectBoardFilterBegin` and `collectBoardFilterEnd` bracket the run. Both fetch the board's filter
JQL (`agile/1.0/board/{id}/configuration` → `api/2/filter/{filterId}`) and compare it to
`_tool_jira_boards.jql`.

- Full-sync, or first run (stored jql empty) → store and continue.
- Changed, with `JIRA_JQL_AUTO_FULL_REFRESH=true` → force full sync and update the stored jql.
- Changed, without that env var → **hard error**, refusing to run: *"filter jql has changed, please use
  fullSync mode"*.

Rationale: changing the board filter changes which issues are in scope, so an incremental run would
leave stale rows behind. If a dashboard suddenly stops updating for one board, this guard is the first
thing to check in the pipeline logs.

---

## 7. Issue ↔ commit linking (two independent paths)

Both write `_tool_jira_issue_commits`, and both are gated on `scopeConfig.ApplicationType`:

- **Remote links** (`collectRemotelinks`/`extractRemotelinks`) — runs **only when `ApplicationType` is
  empty**. Reads `api/2/issue/{id}/remotelink` and pulls a commit SHA out of the link URL using
  `scopeConfig.RemotelinkCommitShaPattern` (capture group 1), falling back to
  `RemotelinkRepoPattern` regexes.
- **Development panel** (`collectDevelopmentPanel`/`extractDevelopmentPanel`) — runs **only when
  `ApplicationType` is non-empty**. Hits the undocumented
  `dev-status/1.0/issue/detail?applicationType=<GitLab|GitHub|…>&dataType=repository`, which gives
  commit id + repo URL directly.

They are mutually exclusive — exactly one path is live per scope config. `convertIssueRepoCommits`
additionally derives `repo_url` from the commit URL via the hardcoded pattern `(.*)\-\/commit` plus
`RemotelinkRepoPattern`.

⚠️ **Both produce `issue_commits.commit_sha` values that only join to `commits` if a git plugin
collected the same repos.** A Jira-only deployment has these rows pointing at nothing. Any
issue↔code panel needs both sides present.

---

## 8. Incremental collection

Several subtasks use `NewStatefulApiCollector` / `NewStatefulApiExtractor` / `NewStatefulDataConverter`:
`collectIssues`, `collectEpics`, `collectIssueChangelogs`, `collectIssueComments`, `collectWorklogs`,
`collectRemotelinks`, `collectDevelopmentPanel`, `extractIssues`, `extractEpics`,
`extractIssueChangelogs`, `convertIssues`, `convertIssueChangelogs`.

- Issue collection JQL is `updated >= '<since>' ORDER BY created ASC`. **Sorted by `created`, not
  `updated`, deliberately** — sorting by `updated` would let rows jump between pages mid-collection
  and go missing.
- `since` is converted to the Jira user's own timezone (fetched from `api/2/user` or `api/3/user`);
  if that lookup fails it falls back to UTC **minus 24 hours** as a safety margin.
- `extractIssues`' `BeforeExtract` deletes that issue's labels and relationships before re-extracting,
  so those stay consistent on incremental runs (they are full delete+insert, not upsert).
- `convertIssues` on a **full** (non-incremental) run deletes existing `issues`, `issue_assignees` and
  `board_issues` rows matching the raw-data params first.

Practical effect for dashboards: `updated_date` is reliable for "recently touched"; a row's absence is
not proof of deletion in Jira unless a full sync has run.

---

## 9. Gotchas checklist for panel SQL

1. **Scope by `LIKE 'jira:%'`**, mirroring the GitHub panels' `'github:%'`.
2. **`project_mapping.table = 'boards'`** — Jira has no `'repos'` rows. A panel copied from the GitHub
   folder that joins `pm.table = 'repos'` returns nothing.
3. **`IN_PROGRESS` is real here** (§4). Don't carry over the GitHub assumption that it is always empty.
4. **Match `original_type` exactly** (`= 'Bug'`), don't keyword-match — the GitHub `type_map` CTE
   exists to work around label-derived types that Jira does not have.
5. **`issue_comments` is unusable**: convertor off by default *and* its primary key is the issue id.
6. **One assignee per issue** — `issue_assignees` never fans out, so the GitHub panels' concern about
   many-to-many assignee joins double-counting does not apply.
7. **`lead_time_minutes` is null for unresolved issues**, and is raw wall-clock from creation to
   resolution.
8. **`story_point` is `0`, not null, when unconfigured** — `toToolLayer` initialises it to a pointer at
   `var workload float64`. `WHERE story_point > 0` is the safe filter.
9. **Sprints are real for Jira** (`started_date`, `ended_date`, `completed_date` all populated), so the
   Planned-vs-Adhoc split that is always empty on the GitHub dashboards actually works here.
10. **`accounts.full_name` == `accounts.user_name`** for Jira rows (both = displayName). The GitHub
    panels' `COALESCE(full_name, user_name, email)` display-name chain still works, it just has no
    second option to fall back to. `accounts.email` comes from Jira's `emailAddress`, which is often
    hidden by privacy settings and blank — the same silent-dropout problem the GitHub dashboards hit.
11. **Account id fallback chain**: `accountId` → `key` → `emailAddress` (`user.go getAccountId`). On
    Jira Server there is no `accountId`, so ids are usernames or emails. Do not assume the opaque
    Atlassian cloud id shape.
12. **`components` / `fix_versions` are comma-joined strings** — needs `LIKE`/`FIND_IN_SET`, not a join.
13. **Two connections to one Jira instance = duplicate issues** under different ids (§2).
14. **Epics are issues too**, in the same tables, with `original_type = 'Epic'`. Exclude them from
    throughput counts, or they inflate totals. Other issues point at them via `issues.epic_key`.
15. **`convertSprintIssues` ignores the board filter** — it converts all sprint-issue pairs on the
    connection, so `sprint_issues` can reference issues outside the board you scoped to.

---

## 10. Test coverage

`tasks/` has only three test files — `epic_collector_test.go`, `issue_collector_test.go`,
`issue_convertor_test.go`. The real coverage is the e2e suite at `backend/plugins/jira/e2e/`
(19 test files), which replays CSV fixtures from `e2e/raw_tables/` through extract/convert and
snapshot-compares against `e2e/snapshot_tables/`. That is the fastest way to see concrete example rows
for any of these tables — read the CSVs rather than guessing at shapes.
