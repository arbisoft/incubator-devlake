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
