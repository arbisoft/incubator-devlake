<!--
Licensed to the Apache Software Foundation (ASF) under one or more
contributor license agreements.  See the NOTICE file distributed with
this work for additional information regarding copyright ownership.
The ASF licenses this file to You under the Apache License, Version 2.0
(the "License"); you may not use this file except in compliance with
the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->
# Tech debt findings

Review findings that are out of scope for the pull request that raised them, kept here so they can be picked up later.

## Claude dashboards CI check

Raised by @ubaidkhalidarbisoft in the re-review of [PR #111](https://github.com/arbisoft/incubator-devlake/pull/111) on 2026-10-22, against `.github/scripts/check_claude_dashboards.py` and `.github/workflows/claude-dashboards-check.yml`.

### The check passes when it finds no dashboards

- **Where:** `.github/scripts/check_claude_dashboards.py`, the loop over the checked folder ([thread](https://github.com/arbisoft/incubator-devlake/pull/111#discussion_r4346785166)).
- **Problem:** if the checked folder doesn't exist or has no `*.json` files, the loop finds nothing and the script reports `0 problem(s)`. Renaming `grafana/dashboards/Claude` would leave CI green while checking nothing.
- **Also:** duplicate panel ids aren't reported, although they make `viewPanel=panel-N` ambiguous.
- **Suggested fix:** fail when no dashboards are found, and report any panel id that appears more than once in `panels(dashboard["panels"])`.

### The datasource check only rejects one wrong form

- **Where:** `.github/scripts/check_claude_dashboards.py`, the datasource loop ([thread](https://github.com/arbisoft/incubator-devlake/pull/111#discussion_r4346785175)).
- **Problem:** it only rejects a dict datasource with `type == "mysql"`. A typo such as `"datasource": "MySQL-typo"`, a `{"uid": "devlake-mysql"}` reference, or a datasource of another type all pass, and the panel then fails in Grafana.
- **Suggested fix:** allow only known references: the string `"mysql"`, the built-in Grafana annotation source, and `null`.

### The workflow has no permissions block

- **Where:** `.github/workflows/claude-dashboards-check.yml` ([thread](https://github.com/arbisoft/incubator-devlake/pull/111#discussion_r4346785183)).
- **Problem:** with no `permissions:` block the job gets the repository's default `GITHUB_TOKEN` scope, although it only reads files.
- **Suggested fix:** add `permissions: contents: read`, as `codespell.yml` does.
- **Nit:** also run the check on `push` to `main-arbisoft` with the same `paths`, so direct pushes and merges are checked too.

## Claude dashboards variable injection

Raised by @ubaidkhalidarbisoft as T08 in the review of [PR #125](https://github.com/arbisoft/incubator-devlake/pull/125) on 2026-10-28, and again in the follow-up review on 2026-10-29. It affects every dashboard in `grafana/dashboards/Claude`.

### Crafted filter values bypass the project scoping

- **Where:** the `user`, `repository`, `project` and `otel_teams` filters, wherever they're interpolated with `${x:sqlstring}` or `${x:regex}` ([thread](https://github.com/arbisoft/incubator-devlake/pull/125#discussion_r4410711256), [original thread](https://github.com/arbisoft/incubator-devlake/pull/125#discussion_r4403817598)).
- **Problem:** Grafana's `:sqlstring` only doubles `'`, but MySQL treats `\` as an escape. A URL with `var-user=a\` and `var-user=)) OR 1=1 -- ` produces `'a\',')) OR 1=1 -- '`, which closes the filter and adds `OR 1=1` at the top level. A viewer with no `user_project_mapping` rows then sees every team's rows. `:regex` has the same problem with `'`.
- **Tried, and why it doesn't work** (tested on Grafana 13.2.2 and MySQL 8.4):
  - `allowCustomValue: false` on the filters: the variable keeps the crafted URL values on first load, and the panels run with them. Grafana drops them only on a later variable refresh.
  - Other Grafana formats: `:singlequote` and `:doublequote` leave `\` alone. `:json` and `:lucene` escape it, but wrap a multi-value in `[...]` or `( ... OR ... )`, which MySQL can't use as an `IN` list.
  - `/*+ SET_VAR(sql_mode='NO_BACKSLASH_ESCAPES') */`: the hint applies after the statement is lexed, so `'a\'` is still unterminated.
  - A `SET SESSION sql_mode = ...;` prefix: the MySQL datasource rejects multiple statements.
- **Limit:** any viewer can POST raw SQL to `/api/ds/query`, so the `user_project_mapping` filter in dashboard SQL limits what each panel shows but isn't an access boundary. Closing this breakout wouldn't make it one.
- **Possible fixes:**
  - Give Grafana its own MySQL user whose sessions run with `NO_BACKSLASH_ESCAPES` (for example through `init_connect`). Before that, rewrite the backslashes in other dashboards' SQL, about 224 of them in the GitLab dashboards, which would change meaning.
  - Pass the filters as `${x:percentencode}`, whose output is safe inside `'...'`, and decode it in SQL. This needs a decoder in every panel and variable query.
  - For a real boundary, enforce access outside the dashboard JSON: restrict datasource queries per user, or give each viewer a database user that can only read their projects' rows.
