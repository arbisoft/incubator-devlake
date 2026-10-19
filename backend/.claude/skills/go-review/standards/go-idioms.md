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
# Go Idioms

Sources: [Effective Go](https://go.dev/doc/effective_go), [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments), [Google Go Style Guide](https://google.github.io/styleguide/go/).

Each rule has an ID (`GO-…`). Reviews cite it; implementations follow it.

**Check the module's Go version first.** Read the `go` line in `go.mod` before suggesting or using a newer language or stdlib feature: `errors.Join` (1.20), `log/slog`, `min`/`max`, `slices`, `maps` (1.21), range-over-int (1.22), `iter.Seq` (1.23). A suggestion the toolchain can't compile is a wrong finding.

## GO-X — Project conventions

**Severity:** GO-X2 (mixed styles) is **non-blocking** and goes under **API & naming**. GO-X5 (typed nil through an error interface) is **blocking** and goes under **Correctness**. GO-X1, X3 and X4 are guidance on how to read other rules and produce no findings of their own.

The rules below give Go's default *form* for some things (`fmt.Errorf`, `error`, the stdlib `testing` package). A module often has its own established form for the same job. Find it before applying those rules.

- **GO-X1 The project's error package takes precedence.** If the module has its own error package or type that most of the code uses, use it. To detect it, compare counts in the packages being changed, e.g. `grep -rhoE 'errors\.[A-Za-z]+\.(Wrap|New)\(' <pkgs>` against `grep -r 'fmt.Errorf' <pkgs>`. Then:
  - Its wrap helper meets GO-E2 **when a context message is given**. Wrapping without a message (`WrapRaw`-style) still needs a reason.
  - Its type or kind checks meet GO-E3 and GO-E4. If its type implements `Unwrap() error`, std `errors.Is`/`errors.As` also work through the chain, and either is fine.
  - Returning its error interface type is correct wherever this standard says `error` (DI-C1, GO-E9).
  - GO-E7's message style applies to its messages.
  - *Example (this repo):* `core/errors` is used ~2,000 times, against about 80 uses of `fmt.Errorf`. New code writes `return nil, errors.Default.Wrap(err, "load connection")` or `errors.BadInput.New("connectionId is required")` and returns `errors.Error`.
- **GO-X2 Following the convention is never a finding. Mixing styles is.** A new `fmt.Errorf` in a package that uses the custom type, or a plain `error` returned where the package returns the custom type, is a **non-blocking** finding, filed under **API & naming** (it's a style mismatch, not an error-handling defect). The reverse is treated the same way. Existing mixed code that the change doesn't touch isn't a finding.
- **GO-X3 The same precedence applies to other conventions of form:** the logger interface (OBS-L1), the test assertion library (GO-T8), the mock generator (DI-T2) and the constructor return type (DI-C1). Match the package first, then the module.
- **GO-X4 Conventions never override principles.** GO-X covers *form* only. A project habit that breaks a DI, SOLID, GoF, SEC, REL or API rule is still a finding under that rule. DI-B says how to handle existing code without spreading the problem.
- **GO-X5 Typed-nil interfaces.** When the error type is an interface (like `errors.Error`), never return a typed nil pointer through it (`var e *myErr; return e`). The result is a non-nil interface, so `err != nil` is true. Return a literal `nil`. This is a **blocking** finding, filed under **Correctness**: callers treat success as failure, or dereference a nil pointer.

## Naming

- **GO-N1 MixedCaps.** No underscores in Go identifiers (`userID`, not `user_id`). Test functions like `TestFoo_Bar` are the exception.
- **GO-N2 Initialisms keep one case.** `ID`, `URL`, `HTTP`, `JSON`: `userID`, `ServeHTTP`, `parseURL`. Not `UserId`, `ParseUrl`.
- **GO-N3 No stutter.** The package name is part of the identifier. `user.New`, not `user.NewUser`; `config.Loader`, not `config.ConfigLoader`.
- **GO-N4 Package names** are short, lowercase, single words that name what the package provides. Never `util`, `common`, `helpers`, `misc`, `base`.
- **GO-N5 Getters have no `Get` prefix.** `Owner()` / `SetOwner()`.
- **GO-N6 Receivers** are one or two letters taken from the type name (`c *Client`), and the same name on every method. Never `this` or `self`.
- **GO-N7 Name length follows scope.** Short names for small scopes (`i`, `r`), descriptive names for package-level identifiers and wide scopes.
- **GO-N8 Interfaces with one method** are named method + `-er` (`Reader`, `Fetcher`), unless a role name reads better.

## Errors

- **GO-E1 Return errors; don't panic.** `panic` is only for programmer errors that can't happen (broken invariants) and inside `Must…` helpers used at init. Library and business code never panics on bad input or I/O failure.
- **GO-E2 Wrap with context.** `fmt.Errorf("load user %d: %w", id, err)`. Use `%w` when callers may need to inspect the cause and `%v` to deliberately hide it. Wrap messages say what was being done, not "failed to" / "error". With a project error package (GO-X1), use its wrap helper with a message instead, e.g. `errors.Default.Wrap(err, fmt.Sprintf("load user %d", id))`.
- **GO-E3 Inspect with `errors.Is` / `errors.As`**, or with the project error package's kind checks (GO-X1). Never compare `err.Error()` strings or use `==` on wrapped errors.
- **GO-E4 Sentinel and typed errors for branching.** If callers need to tell cases apart, export `var ErrNotFound = errors.New("not found")` or a typed error, or use the project error package's kinds (e.g. `errors.NotFound.New(…)`, GO-X1). Don't make callers parse messages.
- **GO-E5 Never ignore an error.** `_ = f()` needs a comment saying why it's safe. Unchecked `Close()` on a writer loses write errors (see GO-R2).
- **GO-E6 Handle once.** Either log the error or return it, never both. Logging and then returning produces duplicate log lines all the way up the stack.
- **GO-E7 Error strings**, including messages passed to a project error package's helpers, are lowercase and have no trailing punctuation, because they get wrapped: `"open config: permission denied"`.
- **GO-E8 Indent the error path.** `if err != nil { return … }` comes first and the happy path stays at the left margin. No `else` after a `return`.
- **GO-E9 No in-band errors.** Don't return `-1`, `""` or `nil` to mean failure. Return `(T, error)` or `(T, bool)`.

## context.Context

- **GO-C1 First parameter, named `ctx`.** `func (s *Svc) Load(ctx context.Context, id int) …`. Only when the function, or something it calls, does ctx-aware I/O or blocking work. Don't add an unused `ctx` for form (e.g. a service that only calls `dal.Dal`, whose methods take no ctx): its absence there is no finding, and an unused `ctx` param is itself noise.
- **GO-C2 Never store a context in a struct.** Pass it per call. (A struct whose whole purpose is to carry request-scoped state is the only exception, and it needs a comment.)
- **GO-C3 Pass it through every I/O path.** DB, HTTP (`http.NewRequestWithContext`), RPC, and anything that blocks. `context.Background()` / `context.TODO()` only at the top (main, tests, the composition root). If nothing downstream accepts a context, there's no finding.
- **GO-C4 Respect cancellation.** Long loops and blocking selects check `ctx.Done()`. Goroutines started for a request stop when its context is cancelled.
- **GO-C5 Context values** are only for request-scoped data that crosses API boundaries (trace IDs, auth). Never for optional parameters or dependencies (see DI-H3). Keys use an unexported type.

## Concurrency

- **GO-G1 Every goroutine has an owner and an exit path.** Whoever starts it can stop it (context, a done channel, a closed input) and wait for it (`sync.WaitGroup`, `errgroup.Group`). A `go func()` with no way to end it is a leak.
- **GO-G2 Fan-out uses `errgroup`** (or a `WaitGroup` plus error collection), with bounded concurrency (`g.SetLimit`, a semaphore) when the input size is unbounded.
- **GO-G3 Document what a mutex guards.** Put the mutex directly above the fields it protects, with a comment. Every access to those fields holds the lock.
- **GO-G4 Don't copy values that contain locks.** Types with `sync.Mutex`, `sync.WaitGroup` or `atomic` fields use pointer receivers and are passed by pointer.
- **GO-G5 The sender closes the channel**, and only once. Receivers never close it. Closing is only needed when a receiver ranges over the channel or waits for it.
- **GO-G6 Prefer synchronous APIs.** Let callers add concurrency. A function that starts goroutines internally must say so and must not return before they finish, or must return a handle to wait on.
- **GO-G7 No data races.** Shared maps, slices and struct fields that are written concurrently need a lock, `atomic`, or confinement to one goroutine. Code with concurrency must pass `go test -race`.
- **GO-G8 Timers and tickers are stopped.** `time.After` in a loop leaks timers until they fire. Use `time.NewTimer` / `NewTicker` with `defer t.Stop()`.

## Interfaces

- **GO-I1 Accept interfaces, return concrete types.** Constructors return `*T`, not an interface, unless there are several implementations to hide behind a factory (see GOF-C1).
- **GO-I2 Define interfaces where they are used.** The consuming package declares the small interface it needs. The producing package exports the concrete type. Don't add an interface "for mocking" in the producer package.
- **GO-I3 Keep interfaces small.** One to three methods. Combine by embedding (`ReadWriter`). See ISP-1 and ISP-2.
- **GO-I4 Compile-time assertions.** Each concrete implementation of an interface it's meant to satisfy has `var _ Fetcher = (*HTTPFetcher)(nil)`.
- **GO-I5 No pointers to interfaces.** `*io.Reader` is almost always a mistake.

## Package and API design

- **GO-P1 Packages have one purpose** and no import cycles. Shared types go in the lower-level package. A cycle means there's a missing abstraction (see DIP-2).
- **GO-P2 `internal/`** holds code that other modules must not import.
- **GO-P3 Every exported identifier has a doc comment** that starts with its name (`// Client fetches …`). Comments explain why and the contract (nil handling, errors, concurrency safety), not what the code obviously does.
- **GO-P4 Make the zero value useful** where it's cheap (`sync.Mutex`, `bytes.Buffer`). If it can't be, export a constructor and make sure misuse fails loudly.
- **GO-P5 Optional configuration uses functional options** (`NewClient(base, WithTimeout(5*time.Second))`), not long parameter lists, boolean flags, or exported config fields that are changed after construction. See GOF-C2.
- **GO-P6 No boolean flag parameters** that switch behavior (`Save(x, true)`). Split the function, or use a named option type or a Strategy (GOF-B1).
- **GO-P7 Return early.** Keep nesting shallow. Functions over ~60 lines or with more than three levels of nesting should be split.
- **GO-P8 Copy slices and maps at boundaries.** When storing a caller's slice or map, or returning internal ones, copy them so the caller can't change internal state.

## Resources

- **GO-R1 `defer` right after acquiring.** `f, err := os.Open(p); if err != nil {…}; defer f.Close()`. The same goes for `mu.Lock(); defer mu.Unlock()`, `rows.Close()` and `resp.Body.Close()`.
- **GO-R2 Check `Close` on writers.** A file or buffered writer's `Close` / `Flush` error is the write error. Use a named return and `defer func() { if cerr := f.Close(); err == nil { err = cerr } }()`.
- **GO-R3 Drain and close HTTP bodies** (`io.Copy(io.Discard, resp.Body)`) so connections are reused. Check `resp.StatusCode` before decoding.
- **GO-R4 Bound what you read.** Use `io.LimitReader` / `http.MaxBytesReader` on untrusted input. No `io.ReadAll` on unbounded streams.

## Performance

- **GO-F1 Preallocate** when the size is known: `make([]T, 0, len(in))`, `make(map[K]V, n)`.
- **GO-F2 No needless allocations in hot loops.** Hoist invariant work, reuse buffers, and avoid `fmt.Sprintf` for simple concatenation in loops. Use `strings.Builder` for building strings piece by piece.
- **GO-F3 No unbounded growth.** Caches, buffers, channels and goroutine counts have limits.
- **GO-F4 Avoid N+1 I/O.** Batch DB and API calls instead of making one call per item in a loop.
- **GO-F5 Pass large structs by pointer**, and small value types by value. Don't guess about speed: a performance claim in review needs a reason (allocation in a loop, quadratic behavior), not a hunch.

## Testing

- **GO-T1 Table-driven tests** with `t.Run(tc.name, …)` for anything with more than one input case.
- **GO-T2 Helpers call `t.Helper()`.** Failures report the caller's line.
- **GO-T3 Inject fakes through interfaces.** Units under test are built with fakes or stubs for their dependencies (see DI-T1). No monkey-patching of package variables.
- **GO-T4 No `time.Sleep` for synchronization.** Use channels, `WaitGroup`s or an injected clock. A sleep-based test is flaky.
- **GO-T5 Test behavior through the public API**, not private fields or call order, unless the call order is the contract.
- **GO-T6 Every bug fix has a regression test** that fails without the fix.
- **GO-T7 New behavior has tests**, including the error paths and edge cases (empty input, nil, boundaries, cancellation). For a plugin extractor or converter, an e2e data-flow test (`e2ehelper.DataFlowTester` with a raw-table CSV fixture and an expected snapshot CSV under the plugin's `e2e/`) counts as coverage. A new or changed extractor or converter with neither a unit test nor an updated e2e fixture test is a finding.
- **GO-T8 Useful failure messages:** `t.Errorf("Parse(%q) = %v, want %v", in, got, want)`, got before want. Compare structs with `reflect.DeepEqual` or `cmp.Diff` / `assert.Equal`, whichever the package already uses.
- **GO-T9 `t.Parallel()`** for independent tests that don't share mutable state.
- **GO-T10 Tests clean up** with `t.Cleanup` and `t.TempDir()`, and leave no files, goroutines or global state behind.
