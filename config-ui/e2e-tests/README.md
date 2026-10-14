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

# config-ui e2e tests

Playwright specs that drive a running DevLake stack (config-ui, devlake API, MySQL, and for the OTel specs Grafana, Prometheus and the OTel collector).

## Prerequisites

- A local stack (for example `docker compose -f docker-compose-dev.yml up`) with `AUTH_ENABLED`, `AUTH_ACCESS_ENABLED` and OIDC providers configured.
- `go` on `PATH` (sessions are minted by `backend/test/e2e/mintsession`) and Docker (SQL runs through `docker exec` in the MySQL container; remote Docker hosts are refused).
- An existing `customer_admin` in the access directory (the bootstrap admin); its identity is used for the minted session.
- Auth state: `auth/local-auth-e2e.spec.ts` and `auth/rebase-matrix.spec.ts` need local password auth enabled (`AUTH_LOCAL_ENABLED=true`, state B); `auth/local-auth-state-a.spec.ts` needs it disabled (state A). Specs for the other state skip themselves, detected via `GET /auth/methods`.
- The `/otel` specs need the Grafana, Prometheus and collector endpoints reachable; they create and remove their own DevLake project.
- `settings/grafana-users.spec.ts` also needs local Grafana and the existing management credentials. Its support loader reads `GRAFANA_MANAGEMENT_USER` / `GRAFANA_MANAGEMENT_PASSWORD` from the repo-root `auth-secrets.env` when not supplied in the environment. Values remain private. It creates independent `e2e-` accounts and projects; protected-account writes use a temporary server admin whose status is revoked before deletion. Real Grafana accounts are read-only.
- `ui-kit/ui-kit.spec.ts` skips unless `E2E_UI_KIT_URL` points at a running `yarn start --port <port>` server, because `/ui-kit` is registered only in dev builds and is absent from `dist`. It needs no login or backend.
- The GitHub-backed specs skip unless `E2E_GITHUB_TOKEN` is set (and `E2E_GITHUB_REPO` for data scopes): the create-and-test test in `connections/connection-lifecycle` and all of `connections/data-scope`. `connections/health` and `connections/manage-dialog` always run; with a token they expect online connections, without one they use a dummy token and expect failed ones.
- Specs create only `e2e-` prefixed data (and `e2e_` users) and remove it.

## Environment

Missing variables are read from the repo-root `.env`.

| Variable                                                                   | Purpose                                                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `SESSION_SECRET`                                                           | Signing secret of the running backend (required)                                                                               |
| `E2E_ADMIN_PROVIDER`, `E2E_ADMIN_SUB`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_NAME` | Identity of the existing `customer_admin` (required)                                                                           |
| `DB_URL` or `E2E_DB_USER`, `E2E_DB_PASSWORD`, `E2E_DB_NAME`                | App database credentials (required; `DB_URL` is the backend one, not the Go test `E2E_DB_URL`)                                 |
| `E2E_MYSQL_CONTAINER`                                                      | MySQL container name (default `incubator-devlake-mysql-1`)                                                                     |
| `E2E_DB_HOST`, `E2E_DB_PORT`, `E2E_DB_DSN`                                 | Host-side DB address used by the session minter (default `127.0.0.1:3306`; must be local)                                      |
| `E2E_BASE_URL`, `E2E_API_URL`                                              | config-ui and devlake API (default `http://localhost:4000`, `http://localhost:8080`)                                           |
| `E2E_GRAFANA_URL`, `E2E_PROMETHEUS_URL`, `E2E_COLLECTOR_URL`               | Defaults `http://localhost:3002`, `:9090`, `:8889`                                                                             |
| `E2E_OTLP_HTTP_URL`                                                        | Local collector OTLP/HTTP receiver the OTel spec sends telemetry to (default `http://localhost:4318`)                          |
| `E2E_GITHUB_TOKEN`, `E2E_GITHUB_REPO`                                      | Real GitHub token and a small public repo such as `octocat/Hello-World` (optional; enable the GitHub specs, see Prerequisites) |
| `E2E_UI_KIT_URL`                                                           | URL of a `yarn start` dev server (for example `http://localhost:4173`); enables `ui-kit/ui-kit.spec.ts`                        |
| `E2E_GO_BIN`, `E2E_DOCKER_BIN`                                             | Override the `go` / `docker` executables                                                                                       |
| `DOCKER_HOST`                                                              | Standard Docker variable; if it points at a remote daemon the suite refuses to run SQL                                         |
| `OTEL_RESTART_COOLDOWN_SECONDS`                                            | Seconds the OTel specs wait after a backend restart (default `30`, plus one second)                                            |
| `E2E_UPDATE_GOLDENS`                                                       | `1` makes the write recorder write goldens instead of comparing against them (default unset: compare)                          |
| `PLAYWRIGHT_JSON_OUTPUT_NAME`                                              | Path of the Playwright JSON report (default `test-results/results.json`); feeds `yarn e2e:census`                              |

## Specs

Auth state: B means local login on, A means local login off, "any" means the spec does not depend on it. A spec for the other state skips itself.

**Root**

- `smoke.spec.ts`: the config UI loads without browser errors. Any state.

**`auth/`**

- `local-auth-e2e.spec.ts`: local password auth end to end (login form, validation, throttling, user lifecycle, forced password change, reset, disable, re-enable, logout, privilege boundary, secret handling, account menu, identity linking). State B.
- `local-auth-state-a.spec.ts`: with local login off, the login page shows no password form and creating a local user returns 503. State A.
- `login-providers.spec.ts`: one login button per provider with its logo, the key-icon fallback, the API exposing only the issuer host, and the access-denied message. Any state.
- `rebase-matrix.spec.ts`: combined local and OIDC login composition, provider initiation and callback safety, local session and identity linking, provider lifecycle, dashboard authorisation. State B.

**`shell/`**

- `navigation.spec.ts`: every top-level route renders without browser errors, sidebar navigation, the 404 page, the onboarding page, and the login redirect that keeps `return_url`. Any state (the redirect test skips without an OIDC provider).
- `sidebar.spec.ts`: collapse and expand, persisted collapsed state, group flyouts, active item, links that open in a new tab, and Settings hidden from a member. The member test needs state B.
- `redirects.spec.ts`: legacy routes redirect (`/access`, project and blueprint connection URLs) and project tab URLs load directly. Any state.
- `theme.spec.ts`: the light, dark and system theme cycle, persistence across reloads, and following the OS colour scheme. Any state.
- `db-migrate.spec.ts`: a 428 from the API lands on the migration page, and proceeding returns to the app. Any state.

**`connections/`**

- `catalog.spec.ts`: plugin catalog cards, search, category tabs, sort, connected-only filter, and the card actions. Any state.
- `connection-detail.spec.ts`: deleting scopes (bulk and single) and the block on deleting a connection used by a blueprint. Any state.
- `connection-lifecycle.spec.ts`: create, test, save and rename a GitHub connection (needs `E2E_GITHUB_TOKEN`); delete from the connection page, `claude_code` custom headers, and a rejected credential not signing the user out (no token needed).
- `data-scope.spec.ts`: add a GitHub data scope through the remote picker, create and associate a scope config, remove the scope. Needs `E2E_GITHUB_TOKEN` and `E2E_GITHUB_REPO`.
- `deprecation-notice.spec.ts`: the deprecation notice shows only with a connection on the deprecated plugin and stays closed after a reload.
- `health.spec.ts`: connection tests fire when a card comes into view, are not repeated within the validity window, repeat after it, and a manual retest updates the tested time. Uses `E2E_GITHUB_TOKEN` if set.
- `manage-dialog.spec.ts`: the manage dialog tests its rows, sorts them into Connected and Failed tabs, and shows the scope count. Uses `E2E_GITHUB_TOKEN` if set.
- `webhooks.spec.ts`: create, rename, renew the key of and delete a webhook from the connections page.

**`projects/`**

- `projects-list.spec.ts`: search, sort and pagination survive a reload; empty state.
- `project-blueprint.spec.ts`: create a project, add a connection and scope, edit the sync policy, run and cancel a pipeline, webhooks, tab persistence, delete the project.
- `project-tabs.spec.ts`: each project tab after a direct load, the Claude Code OTel tab, saved DORA and linker settings, discard, webhook attachment, delete guards, and a project without a blueprint.
- `project-rename.spec.ts`: renaming a project moves its Claude Code OTel placement to the new name.
- `blueprint-connection.spec.ts`: the blueprint connection detail page, its breadcrumb, the Manage Data Scope dialog, and removing the connection.

**`advanced/`**

- `blueprints.spec.ts`: blueprint list search, status filter, create dialog, and focus return.
- `blueprint-detail.spec.ts`: blueprint views by URL, the view switch, the current pipeline and history, the pipeline modal, sync policy, rename, enabled switch, delete.
- `pipelines.spec.ts`: pipelines list blueprint filter, sort, configuration drawer, detail modal, log download, and a direct pipeline URL.

**`keys/`**

- `api-keys.spec.ts`: an API key created in the UI authenticates REST calls until revoked; search and expiration sort.

**`settings/`**

- `users.spec.ts`: the access page for an admin, and users search with its empty state.
- `grafana-users.spec.ts`: 15 ordinary user-management flows covering tabs, search/pagination, creation and template reset/detachment, validation, role/status/details/password changes, project access, deletion, a temporary protected account and owned orphan cleanup. Runs in either auth state. Generated passwords stay in memory; automatic captures are disabled and credential-visible assertions avoid locator snapshots.
- `activity.spec.ts`: an activity row opens a drawer with the event action and target.

**`otel/`**

Need Grafana, Prometheus and the collector (see Prerequisites).

- `claude-code-otel.spec.ts`: Claude Code connection creation and one-time credential, organisation binding from first telemetry, credential rotate, finalize and revoke, and the Grafana dashboard check. Restarts the backend, so it waits for the OTel restart cooldown.
- `ingestion-health.spec.ts`: the ingestion health panel shows degraded and unhealthy states.
- `otel-dialogs.spec.ts`: the projects form, the create handoff from a project, and the apply dialog, with focus return.

**`ui-kit/`**

- `ui-kit.spec.ts`: the `/ui-kit` route renders every section in light and dark without console errors. Needs `E2E_UI_KIT_URL`; no login or backend.

## Support files

- `support/pages/`: page objects (see Page objects), plus `paths.ts` (`PATHS`).
- `support/api.ts`: admin API helpers (`adminApi()`, create and delete helpers, `uniqueName`, the OTel restart cooldown wait).
- `support/api-grafana.ts`: guarded DevLake Grafana API helpers, re-exported through `api.ts`.
- `support/grafana.ts`, `grafana-safety.ts` and `grafana-cleanup.ts`: local-only direct-Grafana support, live account-ownership checks and tracked failure-safe cleanup. Specs consume them through `api.ts`; direct mutations refuse non-`e2e-` identities.
- `support/env-file.ts`: shared environment-file parsing used by the existing environment loader and Grafana support.
- `support/db.ts`: SQL through `docker exec` in the MySQL container; refuses remote Docker hosts and non-local DB hosts.
- `support/env.ts`: loads the repo-root `.env`, exports the URLs and `requireEnv`.
- `support/auth-state.ts`: `fetchAuthMethods` reads `GET /auth/methods` so specs can detect the auth state.
- `support/app-copy.ts`: re-exports the app's `constants.ts` copy so page objects reuse the rendered text.
- `support/constants.ts`: golden masking and ignore lists and other shared constants.
- `support/write-recorder.ts`: the write recorder fixture (see Write goldens).
- `support/colour.ts`: colour helpers for theme assertions.
- `fixtures.ts`: the `test` export with the `browserErrors` fixture; `auth-helpers.ts` mints the admin session.
- `tools/census.mjs` and `census.baseline.json`: the assertion census (see Assertion census).

## Running

```sh
cd config-ui
yarn install
npx playwright install chromium
yarn test:e2e          # or yarn test:e2e:ui
```

Specs run serially because they share one database and the login throttle buckets. Test users are named `e2e_*` and only those rows are cleaned up; the login throttle table is truncated between tests.

Run the suite once per auth state (state B with `AUTH_LOCAL_ENABLED=true`, state A with `false`, then recreate the backend). Specs for the other state skip themselves, so each state has its own passed and skipped counts. Give each run its own report with `PLAYWRIGHT_JSON_OUTPUT_NAME`.

## Page objects

Specs never find or drive elements themselves; they call page objects in `e2e-tests/support/pages/<area>.ts`, one class per screen (`ShellPage`, `LoginPage`, `ConnectionsPage`, `ProjectPage`, `BlueprintPage`, `ApiKeysPage`, ...). Selectors, URLs, click sequences and waits all live there, so a reskin only changes page objects.

- Page objects extend `BasePage` (`support/pages/common.ts`) and take `page`. Routes come from `PATHS` in `support/pages/paths.ts`; AntD-specific locator helpers are in `common.ts`.
- Screens that a spec opens and waits on also implement `Screen`: `open()`, `urlPattern` and `ready`.
- Methods describe intent (`generate()`, `revokeKey(name)`, `keyRow(name)`), not mechanics.
- Specs make no `locator`, `getBy*`, `goto`, `click`, `fill` or `waitForURL` calls. `eslint` enforces it (`no-restricted-syntax` on `e2e-tests/**/*.spec.ts`), so no page-object method may be named after one of those calls: use `open()` or `visit()`, never `goto()` or `click()`.
- `expect` calls stay in specs, on values that page objects, `support/api.ts` or `support/db.ts` return. Page objects return locators and values; they do not assert.
- Text that the UI renders lives in page objects, not specs. Once the reskin moves a screen's copy into a pure `constants.ts`, page objects import it from there instead of retyping it.

To add one, create `support/pages/<area>.ts` with a class that extends `BasePage`, add its routes to `PATHS`, then construct it in the spec with `new XPage(page)` and call its methods. Put any new selector in the class, never in the spec.

## Backend outcome assertions

Every flow that changes state also asserts the result through the backend, using `support/api.ts` (admin API calls) or `support/db.ts` (SQL): the user exists with the role, the key is revoked, the sync policy saved, the scope attached. They do not depend on the UI, so they prove the behaviour survived a reskin even when every locator changed. They stay unchanged across a reskin; change one only when the app's behaviour changed on purpose (see Test change classes).

## Write goldens

`support/write-recorder.ts` is an auto fixture on every test. It records the writes (`POST`, `PUT`, `PATCH`, `DELETE`) the browser sends to the app's `/api/**` (or the backend origin) in every browser context the test creates, in order, and compares them with a golden: "the UI still sends the same thing".

**Recorded:** browser requests made by the UI.

**Not recorded:**

- calls through the test-side `APIRequestContext` (`adminApi()` and the helpers in `support/api.ts`), which never pass through a browser context;
- in-page `fetch` calls made through `BasePage.sessionFetch`, which are tagged with the `x-e2e-test-action` header;
- writes matched by `GOLDEN_IGNORED_WRITES` in `support/constants.ts`: connection tests (fired lazily, so their count and timing vary) and the local login and logout posts (covered by backend assertions). Each entry has a comment saying why.

**Normalisation:** numeric path segments become `:id`; `e2e-` names with random suffixes become `e2e-*` (and `e2e_` logins `e2e_*`); body and query keys listed in `GOLDEN_MASKED_KEYS` (ids, timestamps, tokens, passwords) keep the key and have the value replaced by `<masked>`; object keys are sorted; arrays of objects carrying a `plugin` key are sorted by it. Add a key to `GOLDEN_MASKED_KEYS` only for a value that changes per run or is a secret; a golden that differs between runs needs more masking, never a looser comparison.

**Layout:** `goldens/<spec path without .spec.ts>/<slug of the test title>--<8-char hash of the title path>.json`, holding `titlePath` and `writes` (`method`, normalised `path`, normalised `body`). A test that passes without its golden fails with "Missing write golden". Skipped and failed tests record nothing.

**Updating:** `E2E_UPDATE_GOLDENS=1 yarn test:e2e <spec>` writes the goldens for the tests it runs. Without the flag the recorder asserts `toEqual`.

- **When a golden may change:** only as an expectation change for an intended behaviour change. Show its diff in the PR description. A golden never changes to make a failing run pass.
- The state-A goldens (`goldens/auth/local-auth-state-a/`) are generated in state A. Never regenerate a golden recorded in state B while in state A, or the reverse; a golden that differs between states is a finding to report.
- The GitHub data-scope goldens (`goldens/connections/data-scope/`) contain the repository the specs pick, so they depend on `E2E_GITHUB_REPO` being `octocat/Hello-World`. They are not valid for any other value.

## Assertion census

`yarn e2e:census` (`tools/census.mjs`, plain Node) counts per spec file, statically: `test(` declarations, `expect` calls (including `expect.soft` and `expect.poll`), `skip`, `fixme`, and backend assertions (an `expect` whose subject derives from `api` / `db` or a `support/api|db` import).

- Compare mode (default) reads `e2e-tests/census.baseline.json` and fails with `CENSUS FAILED` when any spec's tests, expects or backend assertions drop, when skips or fixmes increase, or when a baseline spec is missing.
- `--write` replaces the baseline with the current counts and an empty `moves` map; run it when tests were added, and show the diff in the PR description.
- `--print` prints the table without comparing.
- `--baseline <file>` compares against another baseline (for example one computed on an earlier commit).
- `--report <file>` (repeatable) also prints passed, skipped, failed and flaky from a Playwright JSON report, for example `--report e2e-stateB.json --report e2e-stateA.json`. Without it the report is `test-results/results.json`. The counts never decide the exit code.
- `--root <dir>` points at another `e2e-tests` directory and `--json <file>` also writes the snapshot.
- `moves` in the baseline maps a renamed or split spec to its new names (`"old.spec.ts": ["a.spec.ts", "b.spec.ts"]`); the grouped specs are then compared in aggregate. Update it in the same change as the rename and explain it in the PR description.

## Test change classes

Every changed line under `e2e-tests/` belongs to exactly one class, named in the PR description:

| Class       | Where                                                            | Allowed when                                                      |
| ----------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Locator     | `support/pages/**` only                                          | Always; this is the expected reskin churn                         |
| Navigation  | `support/pages/**` and `PATHS`                                   | A route moved or a redirect was added                             |
| Expectation | A spec `expect`, a golden, or `support/api.ts` / `db.ts` asserts | Only when the app's behaviour changed on purpose; the PR says why |
| Addition    | New specs, tests or assertions                                   | Always                                                            |

Anything else is a regression and is fixed in the app, not the test: a weakened or removed `expect`, a deleted test, a new `skip` or `fixme` without a cited reason, a widened timeout used to hide flakiness, or a golden changed with no decision behind it.

## Lint and type checks

`yarn lint:check` runs `tsc`, then `tsc -p e2e-tests/tsconfig.json` (type-checks the e2e `.ts` files and `playwright.config.ts`), then `eslint .`. ESLint applies the spec rule above to every `*.spec.ts`; the header and prettier rules apply to all e2e files. Check formatting of a single file with `yarn exec prettier --check <file>`.
