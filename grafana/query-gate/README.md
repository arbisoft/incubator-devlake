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
# Grafana query gate

A reverse proxy placed in front of Grafana. It lets administrators do anything, and lets every other signed-in user run only the SQL that the dashboards already contain, with their own login in the login filter.

## What it checks

- Every `POST /api/ds/query` from a non-admin: each query must use an allowed MySQL datasource uid (or a plain `__expr__` math/reduce/resample/classic_conditions/threshold expression), and its SQL must match a saved query from a dashboard. A saved query that filters on `${__user.login:sqlstring}` only accepts the caller's own login, and one that uses `${__user.email:sqlstring}` only accepts the caller's own email. The email slot does not scope data, so it does not count as a login filter.
- Paths that bypass dashboards (datasource proxy and resources, plugin resources, public dashboards, snapshots, alerting rulers and evaluation, the matching `/apis/...` groups) are reserved for admins. The one read the dashboard page itself makes, `GET /api/dashboards/uid/<uid>/public-dashboards`, is forwarded; creating or changing a public dashboard stays admin-only.
- `PUT /api/user` from a non-admin is forwarded only when it leaves the caller's login and email unchanged. The login and email scope data, so only an admin can change them. Name, theme and password changes work as before.
- Everything else (UI, dashboard JSON, search, other `/api/user*` calls, live websocket, health) is forwarded untouched.

A path is classified in every form Grafana's router might see: decoded and cleaned, decoded and uncleaned, escaped, and any suffix that starts at an `/api/` or `/apis/` segment. The strictest class wins. So `..` segments, encoded slashes or a wrong `GATE_ROOT_PATH` can't turn a gated path into a forwarded one, while sloppy dashboard links such as `//d/<uid>` keep working.

An admin is a Grafana server admin, or a user whose role in their current organisation is `Admin`. An org admin is an admin only for requests that name no other organisation: if the `X-Grafana-Org-Id` header or the `orgId` query parameter is present and is not the caller's current organisation (or is not a number), the request goes through the normal checks. Server admins are always admins. Admin requests are forwarded as received, except that an org admin's request carries `X-Grafana-Org-Id` set to the organisation the gate verified, so Grafana runs it there.

Service-account tokens aren't usable on gated paths: the gate can't resolve them to a role (Grafana answers `/api/user/orgs` with 304 for them), so they get `502` in `enforce` and an `identity_error` log line. Paths that are forwarded untouched work as before. Nothing in DevLake uses one there; anything that needs dashboard data programmatically should go through the DevLake backend, not Grafana.

`Forwarded` and `X-Forwarded-*` headers from the client or an upstream proxy are passed through to Grafana; the gate appends its own hop to `X-Forwarded-For`.

The saved queries come from two places: the dashboards directory shipped with the image (loaded at startup; a compile error stops the gate), and dashboards in Grafana's database that an admin saved last (re-read every sync interval, using the Grafana credentials below). The sync lists dashboards through Grafana's dashboard API and takes the saver from the `grafana.app/updatedBy` annotation. `grafana.app/createdBy` stands in only for a dashboard that was never updated (generation 1); a later version with no known updater, for example because that user was deleted, isn't trusted. A dashboard is trusted only when that value is `user:<uid>` and the uid belongs to a server admin or an organisation Admin; service accounts, anonymous and missing savers are never trusted. A dashboard tagged `devlake:all-projects` may contain queries without a login filter; for any other dashboard such a query is never accepted. Email slots are checked on every dashboard, tagged or not.

An admin save approves the dashboard's whole current content, including earlier changes by Editors. Editors can still save, but their versions aren't trusted until an admin saves the dashboard again, so admins should review panels before saving a dashboard Editors have touched. Each newly trusted version is logged as `dashboard trusted` with the dashboard uid, generation and saver.

Variable values are checked by format: quoted lists and strings may not contain a backslash, `:regex` values may not contain a quote, and a multi-value `:regex` variable with no options may be the empty group `()` that Grafana sends for it. A single-value variable outside quotes (default, `:raw` or `:csv`) must be an unsigned decimal number; inside double quotes it may not contain `"` or a backslash, and `:raw` or `:csv` inside quotes may not contain that quote or a backslash. `$__from` and `$__to` must be digits, and a `:raw` or `:csv` list outside quotes must be comma-separated numbers. No quoted or raw value may contain `$` followed by a letter, digit or `_`, because Grafana expands `$name(...)` macros without regard to quotes; a lone `$`, as in `US$`, is fine. Templates are refused when a variable sits directly after a `$name`, or a text variable sits inside a macro's parentheses. Comments are found the way Grafana finds them before it runs the SQL: `--` starts a comment whatever follows it. A value inside a comment may not contain the comment's terminator (a line break, or `*` and `/` in a block comment), a block-comment value may not start with `!` or `+`, login and email slots are never accepted in comments or backticks, and the login or email may also appear in its default format inside single quotes.

Accepted queries are forwarded in a canonical form of the body, so the SQL that was checked is the SQL Grafana runs. Bodies with duplicate-looking keys that differ only by case are refused.

## Limits

These apply to gated requests from non-admins, in `report` mode as well as `enforce`:

- request body at most 4 MiB (413);
- each `rawSql` at most 256 KiB (413, `query too large`);
- at most 100 queries per request (400, `too many queries`);
- the body must arrive within 30 seconds;
- at most 4 × GOMAXPROCS requests are checked at once; the rest wait their turn rather than fail.

The largest shipped query is about 10 KB.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `GATE_MODE` | required | `off` forwards everything, `report` logs what would be rejected and forwards, `enforce` rejects |
| `GATE_UPSTREAM` | required | Grafana URL, `http` or `https`, no path (for example `http://grafana:3000`) |
| `GATE_LISTEN` | `:3001` | Listen address |
| `GATE_ROOT_PATH` | empty | Grafana sub-path, a clean absolute path such as `/grafana`; must equal Grafana's `appSubUrl` |
| `GATE_DASHBOARDS_DIR` | `/etc/grafana/dashboards` | Shipped dashboards |
| `GATE_MYSQL_DS_UID` | `devlake-mysql` | Comma-separated datasource uids non-admins may query |
| `GATE_GRAFANA_USER`, `GATE_GRAFANA_PASSWORD` | `GRAFANA_MANAGEMENT_USER`, `GRAFANA_MANAGEMENT_PASSWORD` | Grafana account for the dashboard sync. It must be a Grafana server admin, because `/api/users/search` requires it; the gate only reads with it. The pair comes from one source: both `GATE_GRAFANA_*`, or both `GRAFANA_MANAGEMENT_*`. Without them only the shipped dashboards are trusted |
| `GATE_SYNC_INTERVAL` | `60s` | Sync period, at least `10s` |

## Endpoints

- `GET /gate/healthz` answers `{"status":"ok","mode":"...","templates":N,"sync":{...}}`.
- `GET /gate/readyz` answers 200 `{"status":"ready","sync":{...}}` when Grafana's `/api/health` answers 200, otherwise 503 `{"status":"unavailable","sync":{...}}`.

`sync` holds `enabled`, `last_success`, `last_error_at`, `consecutive_failures` and `root_path_ok`. `root_path_ok` is false when `GATE_ROOT_PATH` differs from Grafana's `appSubUrl`; that mismatch is also logged as an error. Sync state never changes a status code: the gate is Grafana's only route, so a red probe would take Grafana offline. Until the first sync succeeds, the gate retries with backoff (2 s doubling up to the sync interval) and trusts the shipped dashboards only.

## Rejection log lines

Every rejection (`rejected`), would-be rejection in report mode (`would_reject`) and failed session check (`identity_error`) is one JSON line with `event`, `mode`, `reason`, `login`, `admin`, `method`, `path`, `location` (the matching or closest saved query), `ref_id`, `sql_sha256` (first 16 hex characters), `dashboard_uid` and `panel_id`. SQL text, request bodies, cookies and authorization headers are never logged.

## Deploying

- Grafana must be reachable only through the gate. Anything that reaches Grafana directly bypasses it.
- The image runs `/usr/local/bin/grafana-query-gate serve`, listening on `:3001`.
- `GATE_MYSQL_DS_UID` must list every MySQL datasource uid non-admins query.
- `GATE_ROOT_PATH` must equal Grafana's sub-path; check `root_path_ok` in `/gate/healthz` after deploying.
- Roll out in `report` mode, check the `would_reject` lines, then switch to `enforce`.
- Only organisation 1 is synced.

## Lint

`grafana-query-gate lint <dashboards-dir>` compiles every saved query and lists those without a login filter (`NO-LOGIN`), except in dashboards tagged `devlake:all-projects`. It exits 1 on any compile error or untagged query without a login filter.

## Development

Run `go vet ./... && go test ./...` in this directory. `verify/` runs the gate against local copies of the staging and prod layouts, with an API suite and a browser pass over every dashboard; see `verify/README.md`.
