# Grafana query gate

A reverse proxy placed in front of Grafana. It lets administrators do anything, and lets every other signed-in user run only the SQL that the dashboards already contain, with their own login in the login filter.

## What it checks

- Every `POST /api/ds/query` from a non-admin: each query must use an allowed MySQL datasource uid (or a plain `__expr__` math/reduce/resample/classic_conditions/threshold expression), and its SQL must match a saved query from a dashboard. A saved query that filters on `${__user.login:sqlstring}` only accepts the caller's own login, and one that uses `${__user.email:sqlstring}` only accepts the caller's own email. The email slot does not scope data, so it does not count as a login filter.
- Paths that bypass dashboards (datasource proxy and resources, plugin resources, public dashboards, snapshots, alerting rulers and evaluation, the matching `/apis/...` groups) are reserved for admins. The one read the dashboard page itself makes, `GET /api/dashboards/uid/<uid>/public-dashboards`, is forwarded; creating or changing a public dashboard stays admin-only.
- Everything else (UI, dashboard JSON, search, `/api/user*`, live websocket, health) is forwarded untouched.

An admin is a Grafana server admin, or a user whose role in their current organisation is `Admin`. An org admin is an admin only for requests that name no other organisation: if the `X-Grafana-Org-Id` header or the `orgId` query parameter is present and is not the caller's current organisation (or is not a number), the request goes through the normal checks. Server admins are always admins. Admin requests are forwarded exactly as received.

Service-account tokens aren't usable on gated paths: the gate can't resolve them to a role (Grafana answers `/api/user/orgs` with 304 for them), so they get `502` in `enforce` and an `identity_error` log line. Paths that are forwarded untouched work as before. Nothing in DevLake uses one there; anything that needs dashboard data programmatically should go through the DevLake backend, not Grafana.

`Forwarded` and `X-Forwarded-*` headers from the client or an upstream proxy are passed through to Grafana; the gate appends its own hop to `X-Forwarded-For`.

The saved queries come from two places: the dashboards directory shipped with the image (loaded at startup; a compile error stops the gate), and dashboards in Grafana's database that an admin saved last (re-read every sync interval, using the Grafana credentials below). The sync lists dashboards through Grafana's dashboard API and takes the saver from the `grafana.app/updatedBy` annotation, or `grafana.app/createdBy` when there is no update. A dashboard is trusted only when that value is `user:<uid>` and the uid belongs to a server admin or an organisation Admin; service accounts, anonymous and missing savers are never trusted. A dashboard tagged `devlake:all-projects` may contain queries without a login filter; for any other dashboard such a query is never accepted.

Variable values are checked by format: quoted lists and strings may not contain a backslash, `:regex` values may not contain a quote, and a multi-value `:regex` variable with no options may be the empty group `()` that Grafana sends for it.

Accepted queries are forwarded in a canonical form of the body, so the SQL that was checked is the SQL Grafana runs. Bodies with duplicate-looking keys that differ only by case are refused.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `GATE_MODE` | required | `off` forwards everything, `report` logs what would be rejected and forwards, `enforce` rejects |
| `GATE_UPSTREAM` | required | Grafana URL, `http` or `https`, no path (for example `http://grafana:3000`) |
| `GATE_LISTEN` | `:3001` | Listen address |
| `GATE_ROOT_PATH` | empty | Grafana sub-path, starts with `/`, no trailing `/` |
| `GATE_DASHBOARDS_DIR` | `/etc/grafana/dashboards` | Shipped dashboards |
| `GATE_MYSQL_DS_UID` | `devlake-mysql` | Comma-separated datasource uids non-admins may query |
| `GATE_GRAFANA_USER`, `GATE_GRAFANA_PASSWORD` | `GRAFANA_MANAGEMENT_USER`, `GRAFANA_MANAGEMENT_PASSWORD` | Read-only Grafana account for the dashboard sync; both or neither. Without them only the shipped dashboards are trusted |
| `GATE_SYNC_INTERVAL` | `60s` | Sync period, at least `10s` |

## Endpoints

- `GET /gate/healthz` answers `{"status":"ok","mode":"...","templates":N}`.
- `GET /gate/readyz` answers `{"status":"ready"}` when Grafana's `/api/health` answers 200, otherwise 503.

## Rejection log lines

Every rejection (`rejected`), would-be rejection in report mode (`would_reject`) and failed session check (`identity_error`) is one JSON line with `event`, `mode`, `reason`, `login`, `admin`, `method`, `path`, `location` (the matching or closest saved query), `ref_id`, `sql_sha256` (first 16 hex characters), `dashboard_uid` and `panel_id`. SQL text, request bodies, cookies and authorization headers are never logged.

## Lint

`grafana-query-gate lint <dashboards-dir>` compiles every saved query and lists those without a login filter (`NO-LOGIN`), except in dashboards tagged `devlake:all-projects`. It exits 1 on any compile error or untagged query without a login filter.

## Development

Run `go vet ./... && go test ./...` in this directory. `verify/` runs the gate against local copies of the staging and prod layouts, with an API suite and a browser pass over every dashboard; see `verify/README.md`.
