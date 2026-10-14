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
# SOLID in Go

Go has no classes or inheritance, so each principle is stated in Go terms: types, packages, interfaces and composition. Apply them **strictly** to new and changed code. Each section lists what counts as a violation; a review finding cites the rule ID.

## SOLID-SRP — Single Responsibility

A type, function or package has **one reason to change**.

Violations:
- **SRP-1 God structs.** A type whose methods cover unrelated concerns, such as fetching, parsing, transforming, persisting and reporting. Signs: more than ~7 dependencies, or method groups that share no fields.
- **SRP-2 I/O mixed with logic.** A function that both performs I/O (DB, HTTP, files) and makes non-trivial decisions. Split it: a pure function decides, and a thin caller does the I/O. The pure part can then be tested without fakes.
- **SRP-3 Layers in one place.** One file or function that handles transport (HTTP parsing, status codes), business rules and persistence. Each layer is a separate type.
- **SRP-4 Functions that do several things.** Signs: an "and" in the name or doc comment (`ValidateAndSave`), or step comments (`// step 1 … // step 2`) inside a long body.

```go
// Bad: parses, decides and writes in one method.
func (s *Importer) Import(ctx context.Context, r io.Reader) error {
	var rows []Row
	if err := json.NewDecoder(r).Decode(&rows); err != nil { … }
	for _, row := range rows {
		if row.Cost > 100 && row.Kind == "api" { row.Flag = true }
		if _, err := s.db.ExecContext(ctx, "INSERT …", …); err != nil { … }
	}
}

// Good: decode, classify (pure) and store are separate, each testable.
func (s *Importer) Import(ctx context.Context, r io.Reader) error {
	rows, err := s.decoder.Decode(r)
	if err != nil { return fmt.Errorf("decode rows: %w", err) }
	return s.store.Save(ctx, Classify(rows))
}
```

## SOLID-OCP — Open/Closed

Add behavior by **adding code**, such as a new implementation of an interface, a new strategy or a new registered handler, not by editing a central conditional.

Violations:
- **OCP-1 Switch on a kind or type that grows.** `switch src.Kind { case "github": … case "gitlab": … }`, repeated or expected to gain cases. Replace with an interface plus a registry or map of strategies (GOF-B1, GOF-C1). Severity follows the Severity rules in `design-patterns.md`: blocking only when the diff duplicates the switch or adds a case to it, otherwise non-blocking.
- **OCP-2 Type switches over your own types** to pick behavior. Put the behavior in a method on the interface instead. Type switches are fine for decoding foreign data, such as `json.Token` or AST nodes.
- **OCP-3 Flag parameters** that add modes to an existing function (GO-P6).
- **OCP-4 Editing a stable function to add a special case** for one caller. Prefer a decorator (GOF-S2) or an option.

A closed `switch` over a fixed, small domain (days of the week, a protocol's three message types) isn't a violation. The finding needs a reason the set will grow or the switch is repeated.

## SOLID-LSP — Liskov Substitution

Every implementation of an interface can **replace any other** without callers noticing.

Violations:
- **LSP-1 Unimplemented methods.** `panic("not implemented")`, or `return nil` / a silent no-op where the contract expects work. If a type can't do it, it shouldn't implement the interface (see ISP).
- **LSP-2 Contract drift.** An implementation that returns different error kinds (`ErrNotFound` vs `nil, nil`), accepts or rejects `nil` differently, mutates its input when others don't, or isn't safe for concurrent use when the interface says it is.
- **LSP-3 Callers type-asserting to the concrete type** to work around differences (`if f, ok := x.(*SlowFetcher); ok { … }`). The abstraction is leaking.
- **LSP-4 Undocumented contracts.** An interface with several implementations but no doc comment on each method about errors, nil handling and concurrency. Without a written contract, substitutability can't be checked. Treat the missing contract as the finding.

## SOLID-ISP — Interface Segregation

Clients depend only on **the methods they use**.

Violations:
- **ISP-1 Fat interfaces.** More than ~3–5 methods, where most consumers use a subset. Split into role interfaces (`Reader`, `Writer`, `Lister`) and compose by embedding where needed.
- **ISP-2 Consumers accepting a big interface or concrete type** but calling one or two methods. Declare a small interface in the consumer (GO-I2).
- **ISP-3 Fakes that stub most methods** with panics or zero values. That's a sign the dependency is too wide.

```go
// Bad: the reporter only reads, but depends on the whole repository.
func NewReporter(repo UserRepository) *Reporter // UserRepository: 9 methods

// Good: the consumer declares what it needs.
type userLister interface {
	ListActive(ctx context.Context) ([]User, error)
}
func NewReporter(users userLister) *Reporter
```

## SOLID-DIP — Dependency Inversion

High-level policy depends on **abstractions it owns**. Infrastructure (DB, HTTP, SDKs, files, clock) depends on, or adapts to, those abstractions, never the other way round.

Violations:
- **DIP-1 Constructing infrastructure inside logic.** `sql.Open`, `&http.Client{}`, `sdk.NewClient(...)` or `os.Getenv` inside a service, converter or handler. Inject it (see `dependency-injection.md`).
- **DIP-2 Domain packages importing infrastructure packages** (a domain or service package importing a concrete DB driver, an HTTP framework or a vendor SDK). The domain declares an interface, and an adapter in an outer package implements it (GOF-S1).
- **DIP-3 Leaking infrastructure types through domain APIs.** For example a service method that returns `*sql.Rows` or `*http.Response`, or takes `gin.Context`. Map to domain types at the boundary.
- **DIP-4 Abstractions shaped by the implementation**, not the consumer. For example an interface that mirrors a vendor SDK one-to-one, including vendor types in its signatures.
