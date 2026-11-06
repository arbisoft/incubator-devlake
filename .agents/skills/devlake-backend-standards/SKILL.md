---
name: devlake-backend-standards
description: Coding style, architecture and quality gates for the DevLake fork's Go backend (backend/ — plugins, server/api, services, migrations, middleware). Use before writing, editing or reviewing any Go code, migration, plugin API/service, auth middleware or backend test.
origin: custom
---

# DevLake Go backend standards

These are the binding rules, condensed. For new datasource plugins, also use the `devlake-plugin` skill.

Work from `backend/`. The module is `github.com/apache/incubator-devlake`, with `go 1.20`.

## Where code goes
```
server/api     HTTP binding, middleware, response mapping
server/services  app orchestration
core           interfaces, DAL, errors, plugin contracts, domain models
helpers        pluginhelper/api (collector/extractor/converter), e2ehelper
plugins/<x>    api/ · impl/ · models/ (+ migrationscripts/) · service/ or tasks/ · e2e/
```
- **Fork features go in plugins** (the `claude_otel` template: `api → service → models`), never in core paths. Touching `server/api/router.go`, the scheduler or core model semantics needs an explicit review.
- **No plugin-to-plugin imports.** Share through `core/` or `helpers/`.
- **API handlers** parse and validate input, call **one** service function, and return `&plugin.ApiResourceOutput{Body, Status}` (or `shared.ApiOutputError` in `server/api`). No DAL, state transitions or side effects.
- **Services** own invariants, transactions, DAL and external calls, and logging. No `gin` or HTTP types.
- **Tasks** are collection and transformation subtasks with raw, tool and domain layers kept separate.
- **No repository layer by default.** The DAL is the abstraction, so keep focused DAL helpers beside the service. Extract a repository only for a shared aggregate query, a multi-write transaction or lock boundary, a test seam, or persistence used by several workflows. When you do, extract the whole entity's operations, not one query.

## Middleware (order is security-critical; `server/api/api.go`)
`RestAuthentication` → `auth.OIDCAuthentication` → `OAuth2ProxyAuthentication` (only when the access directory is off) → `auth.RequireAuth` → `auth.RequirePasswordChange` → `auth.CSRFProtect`.
- One responsibility each. Abort explicitly after writing a response. No business logic.
- Read identity with `shared.GetUser(c)`, which survives `HandleContext` reroutes.
- **With `AUTH_ACCESS_ENABLED=true`:** OIDC plus directory authorization only, with no proxy or Basic fallback. Admit by email only if the ID token marks it verified.
- Admin-only routes fail closed.
- Security-critical authorization and session code lives in its own files, not inside large CRUD services.

## Style
- **Formatting and headers:** `gofmt`. Copy the Apache header **verbatim** from a file in the same package; `goheader` checks the whitespace, including the 4-space indent before the license URL.
- **Names:** short lowercase packages named by responsibility; no feature-local `utils`/`common`/`helpers`. Never declare exported and unexported identifiers that differ only by case in one file; name internal constructors by role (`...WithDependencies`).
- **Types:**
  - statuses, kinds and modes are typed constants in the owning `models` package, reused everywhere, with no repeated literals;
  - request and response bodies are named structs, with no `map[string]any` or `interface{}` contracts.
- **Size:** keep functions focused. Extract when a helper names an invariant or is reused, not to cut line count.
- **Comments:** one line, only for non-obvious constraints. No narration, and no plan or ticket references; rationale goes in the PR.
- **No suppressions:** no `//nolint`, and no disabling linters.

## Errors (`core/errors`)
| Type | For |
|---|---|
| `BadInput` | actionable client input |
| `Unauthorized` / `Forbidden` | no identity / denied |
| `NotFound` | absence |
| `Conflict` | duplicates, stale state |
| `Unavailable` / `Timeout` | retryable dependency failure |
| `Default` / `Internal` | unexpected failure |

- Wrap with context: `errors.Default.Wrap(err, "load otel connection")`.
- Clients never see SQL, paths, tokens or stacks.
- Check every error that affects correctness.
- Best-effort cleanup gets a one-line comment, logs its failure with safe identifiers, and preserves the primary error.
- **No silent failures.** An early return on nil or a skip is logged or returned, unless doing nothing is the documented contract.

## Data, transactions, external calls
- **Mutations that belong together share one transaction:**
  ```go
  tx := db.Begin()
  defer rollbackOnError(tx, &err)
  // writes via tx
  return tx.Commit()
  ```
- **External side effects that can't join a transaction:** persist the desired state first, then define retry or compensation, and make partial application visible.
- **External calls:** pass `context.Context`, reuse configured HTTP clients, close bodies, cap diagnostic reads, and bound retries and timeouts.
- **Never log** secrets, auth headers, passwords, cookies or sensitive payloads (for example prompt text).
- **Retention:** data with a retention policy is enforced in code. A table without retention is a deliberate, documented choice.

## Migrations
- Minimal, plugin-owned, and registered in `models/migrationscripts/register.go`.
- **Not yet applied anywhere shared:** fold later changes into the same migration.
- **Applied:** it's immutable; add a new forward-only migration.
- Lookup columns added outside `AutoMigrate` get explicit indexes.
- Every model is listed in the plugin's `GetTablesInfo()`, checked by `plugins/table_info_test.go`.
- The local DB is disposable. Reset it as `devlake/AGENTS.md` describes, and never touch the prod DB except read-only.

## Tests
- **Table-driven** (`[]struct{name ...}` with `t.Run`) using `testify/require`, for state transitions, security decisions, parsers, mappings and error classification.
- **Every fix** gets a fails-before / passes-after test. New tests remove the ones they make redundant. Never weaken an assertion.
- **DAL mocks** (`make mock`, then `backend/mocks`) are for logic only.
- **Real-DB behaviour** (deletes, upserts, cross-row invariants, conversions, migrations) uses plugin e2e on local MySQL: `helpers/e2ehelper` `DataFlowTester` or the plugin's `e2e/` fixtures, shaped like real production data.
- No secrets in fixtures, goldens or test names.

## Gates (measure at intake on the base commit; hold the stricter)
| Command | Must be |
|---|---|
| `go build ./...` | passes |
| `go test` on the touched packages (+ `plugins/<x>/e2e/...` if DB behaviour changed) | all pass |
| `go vet` on the touched packages | clean |
| `golangci-lint run` on the touched packages | clean (local v1.63.4, CI v1.53.3; note any version-only difference) |
| `gofmt -l` on the touched files | empty |

- Long output (`go test -v`, lint) goes to a temp file; read only the summary.
- CI unit tests (`test.yml`) don't run for `main-arbisoft` PRs, so the local run is the proof.

## Before you finish
1. Each touched endpoint keeps all its behaviours, statuses and edge cases (no capability cut).
2. Re-read your diff for dead code, duplicated helpers or tests, and unrelated churn: no toolchain bumps, formatting sweeps or generated files.
3. Note the upstream-coupling impact (plugin-only vs core) for the PR.
