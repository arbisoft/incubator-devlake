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
# Dependency Injection in Go

**These rules are strict.** In new and changed code, every dependency that is external, has side effects, or isn't deterministic is passed in explicitly, by **constructor injection**. Go needs no DI framework: a constructor that takes interfaces, plus one place that wires them together, is the whole mechanism.

## DI-M — What must be injected

The following are always dependencies. Business logic never creates, looks up or calls them globally:

| Dependency | Inject as | Never in logic |
|---|---|---|
| Database / DAL / repository | a consumer-side interface (`userStore`) | `sql.Open`, global `db` vars |
| HTTP / RPC clients, vendor SDKs | an interface over the calls used, implemented by an adapter (GOF-S1) | `http.DefaultClient`, `http.Get`, `&http.Client{}`, `sdk.New()` |
| Clock | `now func() time.Time` or a `Clock` interface | `time.Now()`, `time.Since()`, `time.After()` for business decisions |
| Randomness / ID generation | `IDGenerator` interface or `func() string` | `uuid.New()`, `rand.*` |
| Logger | a logger interface or `*slog.Logger` (Go 1.21+) passed in | global `log.Printf`, package-level loggers |
| Config / environment | a typed config struct passed to the constructor | `os.Getenv`, `viper.Get` inside logic |
| Filesystem | `fs.FS` or a small interface | `os.ReadFile` deep in logic |
| Metrics / tracing | an interface or provider passed in | global registries used directly |

- **DI-M1** Each row is a separate finding when it's violated in new or changed code.
- **DI-M2** `time.Now()` is allowed only in the composition root, or as the default value of an injected `now` func.

## DI-C — Constructors

- **DI-C1 One constructor per type**, `NewX(required deps…, opts ...Option) (*X, error)`, or `*X` alone if it can't fail. Where the project has its own error type (GO-X1), return that instead of `error`, e.g. `(*X, errors.Error)`. Required dependencies are positional parameters. Optional ones use functional options (GO-P5) with safe defaults.
- **DI-C2 Validate required dependencies.** A `nil` required dependency returns an error (or panics, if the constructor is only ever called at the composition root and documents that). It must never fail later with a nil-pointer panic.
- **DI-C3 Store dependencies in unexported fields.** No exported dependency fields that callers set after construction. No setter injection (`SetDB`), unless a framework forces it, and then with a comment.
- **DI-C4 Constructors do no I/O.** They wire and validate. Connecting, migrating or fetching happens in an explicit `Start(ctx)` / `Open(ctx)` method, so construction stays cheap and testable.
- **DI-C5 No struct literals of service types outside their package.** Callers use `NewX`, so validation can't be skipped.

## DI-H — No hidden dependencies

- **DI-H1 No package-level mutable state.** `var client = …`, `var cache = map…`, and `var defaultX` that logic reads are all violations. Package-level `const`, immutable lookup tables and sentinel errors are fine.
- **DI-H2 No `init()` with side effects** (connecting, registering into globals, reading env). `init` may only set up immutable package data.
- **DI-H3 No service locator.** Don't pull dependencies out of a `context.Context`, a global registry, or a `map[string]any` container at call time. Dependencies go through the constructor.
- **DI-H4 No singletons.** "Only one instance" is decided by the composition root, which builds it once and injects it (see GOF-C3).
- **DI-H5 No hidden construction.** A method that creates its own collaborator (`New…()` inside a method body) is hiding a dependency. Inject that collaborator, or a factory for it (GOF-C1), when a new instance is needed per call.

## DI-R — Composition root

- **DI-R1 Wire in one place.** Each binary (`main`) or entrypoint (a plugin's init/entry, a server's startup) builds the object graph in one function. Everything below it receives its dependencies.
- **DI-R2 The composition root is the only place that knows concrete types** of infrastructure. It may read env/config, open connections and call `time.Now`.
- **DI-R3 Keep wiring explicit.** Hand-written constructors are preferred. If code generation such as `google/wire` is already in use, follow it. Don't add a reflection-based container.
- **DI-R4 Lifetimes are explicit.** The root owns shutdown: it closes what it opened, in reverse order, usually with `defer`.

## DI-T — Testability

- **DI-T1 Unit tests build the unit with fakes.** If a test of business logic needs a real DB, network, wall clock or env var, that's a DI defect in the code under test, not a test problem.
- **DI-T2 Fakes are small structs or func types** in the test file (or a `…test` package). Prefer a hand-written fake for a 1–3 method interface over a generated mock. Use generated mocks only where the package already does.
- **DI-T3 No test-only hooks in production code** (`var nowFunc = time.Now` overridden by tests, `if testing …`). Inject instead.

## DI-B — Existing code that doesn't follow these rules

Strict applies to **new and changed code**, not to rewriting the whole codebase:
- **DI-B1** When new code must call an existing global or concrete dependency, wrap it once at the boundary: declare an interface in the new code, write an adapter around the global, and inject the adapter from the composition root.
- **DI-B2** Don't spread a global further. A changed function that adds a new direct call to a global, or a new `time.Now()`, is a finding even if the file already does it elsewhere.
- **DI-B3** If an existing framework fixes the entry point's shape (a plugin interface method with a fixed signature, an HTTP handler signature), that method is the composition root for its scope. It builds the dependencies and hands them to constructor-injected types that hold the logic.

## Example

```go
// Consumer-side interfaces (DIP, ISP).
type pricer interface {
	Price(ctx context.Context, model string) (Rate, error)
}

// Service holds logic only; all dependencies are injected.
type CostService struct {
	prices pricer
	now    func() time.Time
	log    Logger
}

func NewCostService(prices pricer, log Logger, opts ...Option) (*CostService, error) {
	if prices == nil || log == nil {
		return nil, errors.New("cost service: nil dependency")
	}
	s := &CostService{prices: prices, log: log, now: time.Now}
	for _, o := range opts {
		o(s)
	}
	return s, nil
}

// WithClock overrides the clock; tests pass a fixed time.
func WithClock(now func() time.Time) Option { return func(s *CostService) { s.now = now } }

// Composition root (main / entrypoint): the only place with concrete types.
func run(ctx context.Context, cfg Config) error {
	httpc := &http.Client{Timeout: cfg.Timeout}
	prices := pricing.NewHTTPAdapter(httpc, cfg.PricingURL) // Adapter
	svc, err := NewCostService(retry.Wrap(prices, 3), slogLogger(cfg)) // Decorator
	…
}
```
