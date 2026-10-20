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
# Good Practices

Sources: [OWASP Top 10](https://owasp.org/Top10/), [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/), [Go security best practices](https://go.dev/doc/security/best-practices), [Google SRE book](https://sre.google/sre-book/table-of-contents/), [The Twelve-Factor App](https://12factor.net/).

Four areas: **Security (`SEC-*`)**, **Observability (`OBS-*`)**, **Config and reliability (`REL-*`)** and **Code hygiene and docs (`HYG-*`)**. Like the other standards files, they apply strictly to new and changed code.

## Security (SEC)

### SEC-I — Input
- **SEC-I1 Treat everything external as untrusted:** request bodies, params, headers, files, env, upstream API responses and DB content written by users. Validate type, format, length and range, and normalize (trim, case, Unicode) *before* use. Reject; don't sanitize silently.
- **SEC-I2 SQL is parameterized.** Use placeholders (`?` / `$1`) or the query builder's binding. Never build SQL from input with `fmt.Sprintf` or `+`. Identifiers that must be dynamic (sort column, table name) are checked against an allowlist.
- **SEC-I3 No shell interpolation.** `exec.Command(name, args...)` with separate arguments, never `sh -c` with input. Validate any argument that could be read as a flag (a leading `-`).
- **SEC-I4 No path traversal.** File paths built from input are `filepath.Clean`ed, joined under a fixed root, and checked to stay under it, or opened through `os.Root` / `fs.Sub` where available. Archive extraction checks every entry's path ("zip slip").
- **SEC-I5 No SSRF.** URLs from input that the server fetches are checked against an allowlist of schemes and hosts. Requests to internal addresses (`127.0.0.0/8`, `169.254.169.254`, private ranges) are blocked, and redirects are limited.
- **SEC-I6 Decode untrusted data into typed structs before using it.** A generic map or `interface{}` handed over by a framework (API-H0) and decoded straight into a typed struct with the project's decode helper is fine. Findings:
  - reading raw values with ad-hoc type assertions (`input.Body["token"].(string)`) instead of decoding;
  - passing the raw map or `interface{}` deeper into the code;
  - making authorization or other security decisions on undecoded values;
  - deserializing untrusted data into types that run code.
  Template output uses `html/template`, not `text/template`, for HTML.

### SEC-S — Secrets
- **SEC-S1 No hard-coded secrets**: tokens, passwords, keys and connection strings with credentials. They come from config, env or a secret store, injected at the composition root (DI-R2).
- **SEC-S2 Secrets never appear in logs, errors, API responses (API-B3), URLs (API-A2), metrics labels or panic messages.** Types that hold secrets redact them in `String()` / `MarshalJSON` / `LogValue` where they could be printed.
- **SEC-S3 Secrets at rest are encrypted** where the system stores them (e.g. connection tokens in the DB), using the repo's existing encryption helper.
- **SEC-S4 Compare secrets in constant time** (`crypto/subtle.ConstantTimeCompare`), never with `==`.

### SEC-C — Crypto and transport
- **SEC-C1 Use `crypto/rand`** for tokens, IDs that must be unguessable, nonces and keys. Never `math/rand`.
- **SEC-C2 TLS verification is never disabled** (`InsecureSkipVerify: true`) outside test code. If a user-configurable "skip verify" exists, it's off by default and documented as unsafe.
- **SEC-C3 Use standard algorithms only:** no home-made crypto, no MD5/SHA-1 for security, `bcrypt`/`argon2` for passwords.

### SEC-A — Access control
- **SEC-A1 Authorization is checked at the service boundary** for each object accessed, not only at login. Deny by default.
- **SEC-A2 Least privilege:** DB users, tokens and API scopes request only what's needed. New code doesn't widen permissions without saying so.
- **SEC-A3 Safe defaults:** new features, flags and endpoints are off or restricted until they're configured.

### SEC-D — Dependencies
- **SEC-D1 New dependencies come from maintained, trusted sources** and are pinned in `go.mod`/`go.sum`. Prefer the stdlib or an existing dependency over adding a new one.
- **SEC-D2 No known-vulnerable versions.** Run `govulncheck ./<pkg>/...` on the changed packages when it's installed, and report vulnerabilities that the change brings in or that affect code it touches.

## Observability (OBS)

### OBS-L — Logging
- **OBS-L1 Structured logs**, using the repo's logger interface, injected (DI-M), in that logger's style.
  - With a key/value logger (`slog`, zap), pass fields: `"connectionId", id, "op", "collect"`.
  - With a printf-style logger, such as this repo's `log.Logger` (`core/log`), put the context in the message as labeled values (`logger.Info("collect done connectionId=%d rows=%d", id, n)`). Use `Nested("<scope>")` for a component prefix, and pass errors as the `err` argument of `Warn`/`Error`, not formatted into the message.
  - Use `log/slog` only on Go 1.21+ and only where the repo hasn't standardized on another logger.
- **OBS-L2 Correct levels:**
  - **Error**: needs action, and is logged once where it's handled (GO-E6).
  - **Warn**: degraded but recovered.
  - **Info**: lifecycle events (start, stop, job done).
  - **Debug**: detail.
  An expected condition (not found, validation) is not an Error.
- **OBS-L3 Logs carry context:** the operation, the IDs involved (request/job/connection), counts and durations. "Failed" with no context is a finding.
- **OBS-L4 No PII or secrets in logs** (SEC-S2). Emails, tokens and request bodies are redacted or left out.
- **OBS-L5 No log spam.** No per-item Info logs in hot loops. Log a summary (counts) instead, or log at Debug, or rate-limit.

### OBS-M — Metrics and tracing
- **OBS-M1 Key operations emit metrics** where the repo has a metrics system: count, errors and latency for outbound calls, jobs and endpoints. Use the existing registry, injected.
- **OBS-M2 Metric labels have bounded cardinality.** Never user IDs, emails, raw URLs or error strings as labels.
- **OBS-M3 Tracing spans** wrap outbound I/O and job steps where the repo has tracing, and the context is passed through (GO-C3).

### OBS-E — Diagnosability
- **OBS-E1 Error messages are actionable.** They say what failed, with which input or ID, and what the operator can do (GO-E2). Don't repeat "something went wrong".
- **OBS-E2 Background jobs report their outcome:** success or failure, counts processed, skipped and failed, and duration.

## Config and reliability (REL)

### REL-C — Config
- **REL-C1 Typed config.** Config is a struct, loaded once at the composition root and injected (DI-M, DI-R2). No `os.Getenv` or config lookups inside logic.
- **REL-C2 Validate at startup (fail fast).** Required values are present, and ranges and URLs are valid. A bad config fails at startup with a clear message, not hours later.
- **REL-C3 Documented, safe defaults.** Every option has a default, a comment saying what it does, and a unit (`TimeoutSeconds`, or a `time.Duration`).

### REL-T — Timeouts
- **REL-T1 Every outbound call has a timeout:** HTTP (`http.Client{Timeout: …}` or a ctx deadline), DB queries (ctx), RPC and locks. A `&http.Client{}` with no timeout, or `http.DefaultClient`, has none.
- **REL-T2 Server timeouts:** `http.Server` sets `ReadHeaderTimeout` (and `ReadTimeout`/`WriteTimeout`/`IdleTimeout` as appropriate). Long requests use async jobs (API-S1 `202`).

### REL-R — Retries and failure handling
- **REL-R1 Retry only what's safe:** idempotent operations (REL-I1) and transient errors (timeouts, `429`, `502`/`503`/`504`, connection resets). Never retry `4xx` validation or auth failures.
- **REL-R2 Backoff:** exponential with jitter and a cap on attempts and total time. Honor `Retry-After`. The context is respected between attempts.
- **REL-R3 Retry is a Decorator** (GOF-S2) around the operation, configured at the composition root. It isn't a loop copied into business methods.
- **REL-R4 Partial failure is explicit.** Batch operations decide whether one failure aborts the batch or is collected and reported (`errors.Join`, or a per-item result). Never silently drop failures.
- **REL-R5 Protect dependencies.** Bound concurrency against an upstream (GO-G2), and back off or circuit-break when it keeps failing.

### REL-I — Idempotency
- **REL-I1 Writes that may be retried or re-run are idempotent:** upserts on natural keys, idempotency keys, or "delete then insert" in one transaction. A re-run job must not create duplicates.
- **REL-I2 Transactions** wrap multi-step writes that must succeed or fail together. No outbound network calls inside a DB transaction.

### REL-S — Lifecycle
- **REL-S1 Graceful shutdown:** the composition root catches `SIGINT`/`SIGTERM` (`signal.NotifyContext`), stops accepting work (`server.Shutdown(ctx)`), drains workers, and closes resources in reverse order (DI-R4), all with a deadline.
- **REL-S2 Bounded resources:** queues, buffers, worker pools, caches and request bodies have limits (GO-F3, GO-R4).

## Code hygiene and docs (HYG)

- **HYG-1 No dead code:** no unused functions, unreachable branches, commented-out code, debug prints (`fmt.Println`), or leftover temporary flags.
- **HYG-2 No magic numbers or strings.** Name them as constants with a comment saying where the value comes from (`const maxPageSize = 100 // API limit`). `0`, `1` and obvious literals are fine.
- **HYG-3 Comments explain why**, document contracts (GO-P3), and stay true. A stale comment that contradicts the code is a finding. `TODO`s have an owner or issue link.
- **HYG-4 Focused changes.** The diff does one thing. Unrelated refactors, renames or formatting churn mixed into a feature change are a finding (non-blocking), with a suggestion to split them.
- **HYG-5 Docs follow behavior.** A change to user-visible behavior, config, an API or a CLI flag updates the README, docs, changelog or examples where the repo keeps them, in the same change.
- **HYG-6 Consistent layout.** New files go where similar files already live and follow their naming. No new top-level `utils` packages (GO-N4).
- **HYG-7 Required headers.** New files carry the license or copyright header the repo requires (check existing files or the repo's license-check config).
- **HYG-8 No duplicated logic.** Before writing a helper, search for an existing one. Copy-pasted blocks of more than a few lines become a shared function, or a Template Method (GOF-B2) if the skeleton is what repeats.
