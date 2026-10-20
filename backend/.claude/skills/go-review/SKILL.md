---
name: go-review
description: Review Go changes on the current branch against strict standards — Go idioms (Effective Go, Go Code Review Comments, Google Go Style Guide), SOLID, constructor dependency injection, GoF design patterns, OpenAPI/REST API design and spec accuracy, and good practices (security, observability, config and reliability, code hygiene). Use when the user runs /go-review, or asks to review Go or backend changes against these standards (e.g. "go-review this branch", "check my Go diff for SOLID/DI"). Not for generic "review my changes" or "code review" requests that don't mention Go or these standards (use the built-in /code-review), and not for non-Go code (e.g. config-ui uses react-review).
argument-hint: "[base-branch] [detailed]"
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
# Go Review

Review the Go changes on the current branch against the shared standard in `standards/`:

| File | Rule IDs | Covers |
|---|---|---|
| [standards/go-idioms.md](standards/go-idioms.md) | `GO-*` | naming, errors, context, concurrency, interfaces, package design, resources, performance, testing |
| [standards/solid.md](standards/solid.md) | `SRP-*`, `OCP-*`, `LSP-*`, `ISP-*`, `DIP-*` | SOLID in Go terms |
| [standards/dependency-injection.md](standards/dependency-injection.md) | `DI-*` | strict constructor injection, composition root, no hidden dependencies |
| [standards/design-patterns.md](standards/design-patterns.md) | `GOF-*` | GoF patterns: triggers, Go forms, anti-patterns, misuse |
| [standards/openapi.md](standards/openapi.md) | `API-*` | REST resource design, methods, status codes, errors, bodies, pagination, versioning, spec completeness and accuracy, handler shape |
| [standards/good-practices.md](standards/good-practices.md) | `SEC-*`, `OBS-*`, `REL-*`, `HYG-*` | security, observability, config and reliability, code hygiene and docs |

Read all six files before reviewing. Don't rely on memory of them. The `go-implement` skill writes code to the same files, so a finding here is something `go-implement` would also have avoided.

## Input

Arguments (both optional, any order):
- **base branch**: what to diff against. If given, use it as is.
- **`detailed`**: adds the Specific Comments section.

**Choosing the base when none is given.** Forks often target a branch other than `main`. Diffing against the wrong base reviews the whole fork's history, not the branch. So don't assume `main`. Pick the candidate **closest to HEAD**:

```bash
for b in main-arbisoft origin/main-arbisoft main origin/main \
         "$(git symbolic-ref -q --short refs/remotes/origin/HEAD)"; do
  [ -n "$b" ] && git rev-parse -q --verify "$b^{commit}" >/dev/null || continue
  printf '%s %s\n' "$(git rev-list --count "$(git merge-base HEAD "$b")"..HEAD)" "$b"
done | sort -n -s -k1,1 | head -1        # fewest commits ahead wins; ties keep list order
```

- The candidate list gives this fork's integration branch (`main-arbisoft`) first, then `main`, then the remote's default branch. Edit the list if the fork's target branch changes.
- If the winner leaves more than ~100 commits to review, or two candidates are close, stop and ask which base to use instead of guessing.
- State the chosen base and the number of commits under review in the Summary header (`vs <base>, N commits`).

Collect the changes:

```bash
git branch --show-current
git log <base>..HEAD --oneline
git diff --stat <base>...HEAD
git diff <base>...HEAD -- '*.go'
git diff --name-only <base>...HEAD -- '*swagger*' '*openapi*' '**/docs/**'   # spec files
git status --porcelain            # uncommitted and untracked changes
git diff HEAD -- '*.go'           # uncommitted changes to tracked files
```

Review committed branch changes plus uncommitted changes. Read untracked `.go` files in full.

**Reviewed:**
- `.go` files, including `*_test.go` (against the testing rules).
- Changed API spec files: `swagger.*`, `openapi.*`, spec `docs/`. These are checked against API-D, even if they're generated.

**Skipped:**
- other non-Go files;
- generated Go code (a `// Code generated … DO NOT EDIT.` header, `mocks/`, `*.pb.go`, swaggo `docs.go`);
- `vendor/`.

**API changes:**
- Find the changed routes: route registrations (router tables, `@Router` annotations, `HandleFunc`/`Handle`/framework route calls) and the handlers they point to.
- If handlers changed but the spec didn't, check whether the generated spec is committed (`git check-ignore`). If it's gitignored, the annotations are the spec of record (API-D8).

If nothing is left to review, say so and stop.

## Rules

1. **Only report problems.** No praise, and no "looks good" or "well structured". If a section has no findings, leave it out.
2. **Cite the rule and the location.** Every finding gives `path/file.go:line` and the rule ID (`DI-M1`, `API-S3`, `SEC-I2`, …).
3. **Give the concrete fix.** Name the interface to declare, the constructor signature, the pattern and its Go form, the status code, the annotation line, or the stdlib function to use. "Consider refactoring" isn't a fix.
4. **Investigate, don't guess.** Before claiming a violation, read the surrounding code, the callers, the dependency's definition, the route registration and the API's existing conventions. For example:
   - a "missing injection" may already be injected one level up;
   - a `switch` may be over a closed set (see the OCP note);
   - a "missing test" may exist in another `_test.go` file, or in the plugin's `e2e/` data-flow test and its CSV fixtures (GO-T7);
   - a "non-standard" status code may be the API's existing convention (see the openapi.md consistency note);
   - a "missing timeout" may be set on a shared client;
   - a handler that reads a package-level framework var (`basicRes`, `vld`, `dsHelper`) may be the composition root for its request (DI-B4). Check whether the logic below it receives its dependencies;
   - a generic body map (`map[string]interface{}`) may be the framework's input type, decoded straight into a struct (API-H0);
   - a "non-idiomatic" error or constructor shape (`errors.Default.Wrap`, `(*X, errors.Error)`) may be the project's convention (GO-X1).
   A wrong finding is worse than none.
5. **Skip what tools catch.** Don't report what `gofmt`, `go vet`, `staticcheck` or the repo's golangci-lint config already flag, unless the tool is disabled for that code.
6. **Strict, but only on the change.** The standard applies to new and changed lines, and to new types and routes in full. Existing violations in untouched code are not findings. When a change *spreads* an existing violation (a new `time.Now()` call, a new use of a global, a new route copying a non-standard convention), that is a finding (DI-B2, API-R4).
7. **Each finding appears exactly once.** See Step 5.
8. **Label every finding** **[blocking]** or **[non-blocking]**:
   - Blocking: anything in "Always Request Changes" below, any correctness, concurrency, error-handling or security defect, any API contract break, any DI or DIP violation in new code (but framework init globals read at the composition root, such as `basicRes` in a handler, are not violations: DI-B4), and LSP-1/LSP-2 (they change behavior). SRP, OCP, ISP and GoF findings are blocking **only** per the Severity rules in `design-patterns.md`: when the diff duplicates or grows the anti-pattern, or a pattern is broken (GOF-X2). Otherwise they're non-blocking.
   - Non-blocking: naming, doc comments, small idiom issues, mixed error styles (GO-X2), HYG-4 split suggestions, and missing examples in the spec (API-D6).
   - GO-X has both severities. GO-X2 (style mismatch) is non-blocking, under API & naming. GO-X5 (typed nil through `errors.Error`) is blocking, under Correctness.
9. **Assume a competent author.** Explain only what's not obvious. Don't lecture about what SOLID or REST is.

## Workflow

### Step 1: Context
- Work out the purpose of the change from the commit messages and diff, and the module's Go version (`go` line in `go.mod`). Suggestions must compile on that version.
- List the changed packages. For each new or changed type, note what it depends on: other types, interfaces, globals, and which stdlib calls do I/O, time, randomness or env.
- Find the composition root(s) that build the new types (`main`, entrypoints, framework hooks).
- Find the project's conventions of form (GO-X): the error package and wrap helper (compare grep counts in the changed packages), the logger interface, the test library, the constructor return shape, and the API handler shape with its router adapter (API-H0). State them in one line in the Summary. Findings are judged against them, not against the standard's default forms.
- List new and changed routes (method + path → handler), and note the API's existing conventions: error body, pagination params, field casing, auth.

### Step 2: Line pass
Go through **every changed line** against `go-idioms.md` and `good-practices.md`:
- errors, context, concurrency, resources, naming, API shape, performance and tests;
- input handling, SQL, exec and paths, secrets, crypto (SEC);
- logging and metrics (OBS);
- config and timeouts (REL);
- dead code, magic values and comments (HYG).

### Step 3: Design pass
For **each new or substantially changed type and function**, answer the following:
- **SRP:** what is its single responsibility? Does it mix I/O with decisions, or several layers?
- **DI / DIP:** list every dependency. Is each one injected through the constructor as a consumer-side interface? Is there any `time.Now`, global, `http.DefaultClient`, `os.Getenv`, or hidden `New…()` in its methods? Does the constructor validate its dependencies?
- **OCP / LSP / ISP:** are there growing switches on kind? Do implementations keep the interface contract? Do consumers depend on more methods than they use?
- **GoF:** check each trigger in `design-patterns.md` against the code. If a trigger is present and the pattern isn't, that's a finding. If a pattern is present without its trigger, or is broken, that's a GOF-X finding. For each one, first check whether a framework helper already provides the pattern (if it's used, there's no finding). Then record whether the anti-pattern is **duplicated**, **growing** or a **single occurrence**. That decides the severity.
- **Reliability:** for new I/O, check that it has a timeout (REL-T1), that retries are safe and done as a Decorator (REL-R1–R3), that re-run writes are idempotent (REL-I1), that partial failures are handled explicitly (REL-R4), and that new long-running components shut down cleanly (REL-S1).

### Step 4: API pass
Skip this step if no routes or spec files changed. For **each new or changed route**, read the route registration, the handler and its annotations or spec entry side by side, and check the following. If the project has a handler framework (API-H0), read its router adapter once first, to learn how statuses, error bodies and the request context come about:
- **Contract:**
  - path and naming (API-R), method semantics (API-M);
  - every status the handler can return, and how domain errors map to statuses (API-S, API-E4);
  - the error kind of every failure caused by the client: decode, validation and parse failures must be returned as the client-error kind (e.g. `errors.BadInput.Wrap`), not passed through a helper's generic kind, which gives a 500 (API-S3, API-B1);
  - the error body shape and internal leaks (API-E1–E3);
  - input validation (API-B1), DTOs vs models, secret fields (API-B2, API-B3);
  - times, nullability and number types (API-B5, API-B6, API-B8);
  - pagination and stable ordering for lists (API-P);
  - authn/authz and secrets in URLs (API-A).
- **Compatibility:** compared with `<base>`, is any field, param, route, type, default or validation removed or tightened (API-V1)?
- **Spec:**
  - every param, the body, and each status is documented with the right schema (API-D1–D3);
  - the annotations match the code: path, method, param names, statuses and types (API-D4);
  - named schemas (API-D5), security declared (API-D7);
  - spec regenerated or committed per the repo's practice (API-D8).
- **Handler shape:** thin handler, request context passed through, and route tests in the project's handler-test style (API-H, read through API-H0).

### Step 5: Merge duplicates
Before writing anything, put every candidate finding in a flat list of `(file:line, rule, one-line claim)` and collapse it:
- **Same root cause → one finding.** For example, a hidden `&http.Client{}` with no timeout is DIP-1, DI-M1, GOF-S1 and REL-T1 at once. Report it once, under the first matching section, and mention the other angles in the same bullet.
- **Same fix → one finding.** If one change resolves several bullets, report one finding with several consequences.
- **Same `file:line` twice → merge them**, unless there are two independent defects.

### Step 6: Fact-check
Re-read the code for each merged finding and mark it **valid**, **invalid** or **needs rewording**. Drop invalid ones. If you're still unsure, keep the finding and mark it **(low confidence)**.

### Using sub-agents
- **Small diffs** (under ~400 changed Go lines, or 1–2 packages): do everything inline, with no sub-agents.
- **Larger diffs:** spawn up to **3** `general-purpose` agents in parallel for Steps 2–4, split by package, with API routes going to whichever agent owns the handler package. Give each one the paths of the six standards files, its package list, the base branch, the conventions found in Step 1, and the finding format. Ask for candidate findings only (`file:line`, rule ID, claim, fix, severity case), not a written review. Then use **1** `general-purpose` agent for the Step 6 fact-check of the merged list. Don't use `Explore` for review or fact-checking: it only locates code and reads excerpts, so it can't judge findings. Use it only for a quick search, such as finding a route's registration or a helper's callers.
- Never spawn agents for Step 5. Merging is done by you.

## Output format

Leave out any finding section with no findings. Assign each finding to **exactly one** section: the **first** one in this order that matches its consequence.

1. **Security**: `SEC-*`, `API-A*`, plus any other finding with a security consequence (e.g. a secret leaked through an API-B2 model).
2. **Correctness**: wrong results, nil dereferences, broken logic, data loss, typed nil returned through an error interface (`GO-X5`).
3. **Concurrency**: races, leaks, deadlocks, missing cancellation (`GO-G*`, `GO-C4`).
4. **Error handling**: `GO-E*`. (`GO-X2` goes to API & naming, and `GO-X5` to Correctness.)
5. **API contract**: `API-R*`, `API-M*`, `API-S*`, `API-E*`, `API-B*`, `API-P*`, `API-V*`, `API-H*`.
6. **Dependency injection**: `DI-*`.
7. **SOLID**: `SRP-*`, `OCP-*`, `LSP-*`, `ISP-*`, `DIP-*`.
8. **Design patterns**: `GOF-*`.
9. **Reliability**: `REL-*`.
10. **API spec**: `API-D*`.
11. **API & naming**: `GO-N*`, `GO-P*`, `GO-I*`, `GO-C1`–`C3`, `GO-C5`, `GO-R*`, `GO-X2`.
12. **Observability**: `OBS-*`.
13. **Testing**: `GO-T*`, `DI-T*`, but only when the defect is purely missing or inadequate tests.
14. **Performance**: `GO-F*`.
15. **Code hygiene**: `HYG-*`.

```markdown
## Go Review: <branch> (vs <base>, N commits)

### Summary
<One sentence on what the change does.> <Go version.> <Conventions: error package, logger, test library, handler shape.> <Routes changed: N, or none.> <Overall verdict: N blocking, M non-blocking findings — or "No issues found.">

### Security
- **[blocking]** `path/store.go:57` — sort column from `?sort=` is put into the SQL with `fmt.Sprintf`, so it's open to SQL injection. **Fix:** check it against an allowlist `map[string]string{"created": "created_at", …}` and return 400 for unknown values. (SEC-I2, API-P3)

### API contract
- **[blocking]** `path/handler.go:88` — `ErrNotFound` from the service falls through to `500`. **Fix:** map it to `404` in the shared error mapper. (API-S3, API-E4)

### Dependency injection
- **[blocking]** `path/svc.go:88` — `Sync` calls `time.Now()` to pick the window, so the logic can't be tested and depends on the wall clock. **Fix:** add `now func() time.Time` to `NewSyncer` (default `time.Now` via `WithClock`). (DI-M1, DI-M2)

### API spec
- **[blocking]** `path/handler.go:70` — `@Param connectionId` is missing, and `@Failure 404` is undocumented. **Fix:** add `// @Param connectionId path int true "connection id"` and `// @Failure 404 {object} shared.ApiBody`. (API-D2, API-D3)

### <other sections as needed>

### Recommendation
**Approve** / **Request Changes** / **Needs Discussion**
<One or two lines on what blocks approval.>
```

The finding bullet format is `**[label]** \`file:line\` — problem and consequence. **Fix:** concrete change. (rule IDs)`.

### Always Request Changes

Any of these in new or changed code means **Request Changes**:
- Any security finding (`SEC-*`, `API-A*`).
- An external or nondeterministic dependency that isn't injected (`DI-M*`, `DI-H*`, `DIP-1`).
- A goroutine leak, a data race, or a missing cancellation on a blocking path (`GO-G1`, `GO-G7`, `GO-C4`).
- An ignored error, or a panic on a recoverable error (`GO-E1`, `GO-E5`).
- An outbound call with no timeout (`REL-T1`).
- A breaking API change with no new version or deprecation (`API-V1`).
- A new or changed route whose spec annotations are missing or don't match the code (`API-D1`–`API-D4`).
- New behavior without tests, or a bug fix without a regression test (`GO-T6`, `GO-T7`, `API-H3`).
- A GoF/OCP anti-pattern that this diff **duplicates or grows**, or a broken pattern (`GOF-*`, `OCP-1`, `GOF-X2`). A single occurrence is non-blocking.

**Approve** only when there are no blocking findings. Use **Needs Discussion** when a design or API question needs the author's input, such as a trigger that's arguable, a GoF/OCP trigger that depends on whether the set will grow, or an intended breaking change.

### Specific Comments (only with `detailed`)

These are for single-line points too small for their own categorized finding, such as wording, doc comments or stale comments. Nothing here may repeat a finding above.

```markdown
### Specific Comments
- `path/file.go:17` — doc comment says "returns nil on miss", but the function returns ErrNotFound
```
