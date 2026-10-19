---
name: go-implement
description: Implement, add or refactor Go code to strict standards — Go idioms (Effective Go, Go Code Review Comments, Google Go Style Guide), SOLID, constructor dependency injection, GoF design patterns, OpenAPI/REST API design with accurate spec annotations, and good practices (security, observability, config and reliability, code hygiene) — with a design note first, table-driven tests with injected fakes, and a self-review using the go-review standard. Use when asked to implement, build, add, write or refactor Go code.
argument-hint: "<what to implement>"
---
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
# Go Implement

Write Go code that would pass a `go-review` with no blocking findings. The standard lives in the `go-review` skill. Read all six files before designing, and follow them by rule ID:

- [../go-review/standards/go-idioms.md](../go-review/standards/go-idioms.md): `GO-*`
- [../go-review/standards/solid.md](../go-review/standards/solid.md): `SRP-*`, `OCP-*`, `LSP-*`, `ISP-*`, `DIP-*`
- [../go-review/standards/dependency-injection.md](../go-review/standards/dependency-injection.md): `DI-*`
- [../go-review/standards/design-patterns.md](../go-review/standards/design-patterns.md): `GOF-*`
- [../go-review/standards/openapi.md](../go-review/standards/openapi.md): `API-*`
- [../go-review/standards/good-practices.md](../go-review/standards/good-practices.md): `SEC-*`, `OBS-*`, `REL-*`, `HYG-*`

If the argument is empty, ask what to implement and stop.

## Workflow

### 1. Understand
- Restate the goal in one or two lines.
- Read the packages you'll change, their callers, and the code that builds them (the composition root, DI-R1).
- Read the module's Go version (`go` line in `go.mod`). Use only language and stdlib features that version has.
- Identify the project's conventions of form (GO-X): the error package and wrap helper, the logger, the test library, the constructor return type, and the API handler shape with its router adapter (API-H0). Use them, not the standard's default forms.
- Find what to reuse: existing interfaces, adapters, helpers, error mapper, logger, config struct and test fakes in the same package or module. Don't create a parallel mechanism for something that already exists.

### 2. Design before code
Post a short design note in chat **before writing code**:

```markdown
**Design**
- Responsibilities: <type> — <one responsibility each> (SRP)
- Interfaces (consumer-side): `type x interface { … }` in <package> (ISP, DIP, GO-I2)
- Constructors: `NewX(dep1 a, dep2 b, opts ...Option) (*X, <error or project error type>)` (DI-C1, GO-X1)
- Injected dependencies: DB/clock/HTTP/logger/config/IDs — and their defaults (DI-M)
- Composition root: <file/function> wires <concrete adapters/decorators> (DI-R1)
- Patterns: <GOF-ID name> because <trigger present> — or "none: no trigger present"
- API contract (if routes change): `METHOD /path` → request DTO, response DTO, statuses (success + each error), error body, pagination, auth (API-*)
- Compatibility: additive only, or <breaking change + version/deprecation plan> (API-V)
- Reliability: timeouts, retries (Decorator, which errors), idempotency, shutdown (REL-*)
- Security: input validated where, secrets handling, authz checks (SEC-*)
- Observability: what's logged at which level, metrics/spans (OBS-*)
- Tests: <what's tested, which fakes>
```

- For routes, follow the API's existing conventions (error body, pagination params, casing, auth) before `openapi.md`'s defaults (see its consistency note).
- For each pattern in `design-patterns.md`, check whether its trigger is present. If it is, use the pattern in its Go form. If not, don't add it (GOF-X1). Use the project's framework helper when it already provides the pattern (the "Framework-provided patterns" section). A single closed-enum `switch` or a bounded slice is not a trigger. Read the narrowed triggers before adding a pattern.
- If the existing code fixes the entry point's shape (a framework callback or a fixed interface method), that method is the composition root. It builds the dependencies and delegates to constructor-injected types (DI-B3).
- If the design needs a choice only the user can make (behavior, public API, a breaking API change, a new dependency), ask before coding. Otherwise go ahead.

### 3. Implement
Follow the standards by rule ID. The rules that are most often missed:
- **DI**:
  - Every dependency that is external, has side effects or isn't deterministic comes through the constructor, as a consumer-side interface.
  - No `time.Now()`, `http.DefaultClient`, `os.Getenv`, global vars or `init()` side effects in logic (DI-M, DI-H).
  - Constructors validate their required dependencies and do no I/O (DI-C2, DI-C4).
  - Existing globals are wrapped once in an adapter at the boundary (DI-B1). Framework globals set at init (e.g. a plugin's `basicRes`) are read **only in the handler or task entry point**, which passes `GetDal()`, `GetLogger()` and config into constructor-injected services (DI-B3, DI-B4). Never read them from services or helpers. Passing `taskCtx` into framework subtask helpers (`api.RawDataSubTaskArgs{Ctx: taskCtx}`, collectors, extractors, converters) and task-local helpers in the `tasks` package is fine (DI-B4).
- **SOLID**:
  - Separate pure decision logic from I/O (SRP-2).
  - No growing switches on kind (OCP-1).
  - Small interfaces (ISP-1).
  - Domain code never imports infrastructure (DIP-2).
- **Go idioms**:
  - `ctx` first and passed through all I/O, where something downstream accepts one. No unused `ctx` param for form, e.g. in services that only call `dal.Dal`, whose methods take no ctx (GO-C1, GO-C3).
  - Errors wrapped with a context message using the project's error package (GO-X1), otherwise `fmt.Errorf` with `%w`, and handled once (GO-E2, GO-E6).
  - Every goroutine owned and stoppable (GO-G1).
  - `defer` cleanup right after acquiring (GO-R1).
  - `var _ I = (*T)(nil)` assertions (GO-I4).
  - Doc comments on every exported identifier, stating the contract (GO-P3, LSP-4).
- **API**:
  - Thin handlers: decode the framework's input (`input.Body`, or its equivalent) straight into a named request struct with the project's decode helper and a validator (API-B1, SEC-I6). Wrap any decode or validation failure as a client error, e.g. `errors.BadInput.Wrap(err, "invalid request body")`. Helpers like `api.Decode` return `errors.Default` around a plain error, which comes out as a 500 (API-S3). Then call the injected service, passing the framework's request context to any ctx-aware call (here, through a nil-guarded helper like `apiRequestContext` in `plugins/plane/api/connection_api.go`: `input.Request` is nil except for multipart/protobuf bodies, so a bare `input.Request.Context()` panics on every JSON or GET request; API-H2), and map the result to a DTO. Return the right error kind, so the adapter or shared mapper produces the right status (API-H0–H2, API-E4).
  - Request and response DTOs are separate from DB models. Secrets are write-only (API-B2, API-B3).
  - Write the spec annotations together with the handler: every param, the body, each success and error status, named schemas, security (API-D1–D7). Then regenerate the spec (API-D8).
- **Good practices**:
  - Parameterized SQL, allowlists for dynamic identifiers, no shell interpolation, contained file paths (SEC-I2–I4).
  - No secrets in code, logs, errors or responses (SEC-S1, SEC-S2).
  - Every outbound call has a timeout (REL-T1). Retries only for safe, transient failures, as a Decorator with backoff and jitter (REL-R1–R3). Re-run writes are idempotent (REL-I1).
  - Typed config, validated at startup and injected (REL-C1, REL-C2).
  - Structured logs through the injected logger, at the right level, with IDs and no PII (OBS-L1–L5).
  - Named constants, no dead code or debug prints, and docs updated when behavior changes (HYG-1, HYG-2, HYG-5).
- Match the surrounding code where the standard doesn't decide: file layout, test library (`testify` vs stdlib), and the license header used on existing files.
- **Scope**: change only what the task needs, plus the boundary adapters DI-B1 requires. No unrelated refactors. Don't edit generated files. Regenerate them with the repo's generator if their source changed.

### 4. Test
- Write table-driven tests (GO-T1) that build the unit with **hand-written fakes** injected through its interfaces (DI-T1, DI-T2). Use the repo's generated mocks only where the package already uses them.
- For each new or changed route, write tests in the project's handler-test style (API-H3), with a fake service: a direct call with a constructed input for framework handlers (e.g. `&plugin.ApiResourceInput{Params: …, Body: …}`), or `httptest` for `net/http`. Cover the success status and body, a validation failure that names the field, not found, and the error kind/status (`err.GetType().GetHttpCode()` or the response code).
- Cover the happy path, error paths, edge cases (empty, nil, boundaries) and cancellation. Use a fixed injected clock for any time logic (GO-T4). A bug fix gets a regression test that fails without the fix (GO-T6).
- Run these from the module root (the directory with `go.mod`), for the changed packages:

```bash
gofmt -l <changed dirs>                  # must print nothing
go build ./...
go vet ./<pkg>/...
go test -race ./<pkg>/...
golangci-lint run ./<pkg>/...            # only if installed; use the repo's config
govulncheck ./...                        # only if installed
<repo spec generator>                    # if routes changed, e.g. make swag / swag init
```

Fix every failure. If a command can't run (missing tool, needs a DB or network), say which one and why. Never claim it passed.

### 5. Self-review
Run the `go-review` workflow (Steps 1–6 of `../go-review/SKILL.md`) inline on your own diff (`git diff HEAD` plus new files), with no sub-agents. Fix every **[blocking]** finding and re-run the tests. Fix each **[non-blocking]** GoF/SOLID finding, or list it in the report with a one-line reason. The same goes for any other non-blocking finding you chose to leave.

### 6. Report
Keep it short:
- **Changed:** the files and what each change does.
- **Design:** interfaces added, the constructor and DI wiring, the composition root, the patterns used (GOF IDs) and the triggers that justified them.
- **API:** routes added or changed, with method, path and statuses; spec updated or regenerated; any breaking change and its deprecation.
- **Security and reliability:** validation, secrets handling, timeouts and retries added, and anything deliberately left out.
- **Tests:** the commands run and their results (pass/fail counts, or the failure output).
- **Not done / skipped:** anything left out, commands that couldn't run, and non-blocking findings left in place.

## Guardrails
- Don't commit, push or open PRs unless asked.
- Don't change public APIs or behavior beyond the task without asking. Never make a breaking API change (API-V1) without the user's say-so.
- Don't add a new third-party dependency without asking (SEC-D1).
- Don't edit migration scripts or other files the repo treats as immutable once merged. Add new ones.
- If the task conflicts with the standard (e.g. "just use a global here"), point out the conflict, name the rule, and follow the user's choice.
