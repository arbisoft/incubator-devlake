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
# GoF Design Patterns in Go

**Strict mode.** When code matches a pattern's **trigger**, that pattern is expected. A hand-rolled alternative (the **anti-pattern** listed) is a finding that cites the pattern ID. How severe that finding is depends on the Severity rules below. Patterns are written in their Go form: interfaces, func types and composition, never class hierarchies copied from Java.

A trigger must actually be present in the code. Don't report "could use pattern X" for code that has no trigger. A pattern applied without its trigger (an interface with one implementation and no second one in sight, a factory that only ever returns one type) is reported under **GOF-X** (misuse).

## Severity

Every GoF finding states which case applies: **"duplicated at A and B"**, **"grows the switch/chain at X"**, or **"single occurrence"**.

- **Blocking**:
  - the diff **duplicates** the anti-pattern: a second copy of the same switch, skeleton, retry loop or orchestration;
  - the diff **grows** the anti-pattern: a new case added to a switch or chain on an open set that already exists, or a new mode flag added to an existing function;
  - **GOF-X2** broken structure that causes wrong behavior: a decorator that drops errors or bypasses the inner call, a strategy that is selected inside the consumer anyway, an observer whose subscribers leak.
- **Non-blocking**:
  - the trigger is present, but the anti-pattern appears **once** and the diff doesn't grow it;
  - GOF-X1, GOF-X3 and GOF-X4 misuse with no behavioral effect.
- **Needs Discussion**: whether the trigger applies depends on intent the code doesn't show, such as "will more providers be added?".

The same rules decide severity for OCP-1/OCP-2 in `solid.md`, because those are the same defect seen from the SOLID side.

## Framework-provided patterns

When the project's framework or helpers already provide a pattern's mechanics, using them satisfies the pattern. Examples:
- a cursor-based converter or extractor helper provides Iterator (GOF-B7);
- a collector or extractor helper that takes pluggable callbacks provides Template Method / Strategy (GOF-B2, GOF-B1);
- a shared API client with built-in retry and rate limiting provides Decorator (GOF-S2).

Code that uses the helper is never a GoF finding. Hand-rolling the mechanics when the helper fits is the finding, with severity per the rules above.

## Creational

### GOF-C1 Factory Method / Abstract Factory
- **Trigger:** the caller chooses one of several implementations of an interface by config, kind or input. Or a family of related objects must be created together (a client, its parser and its paginator for one provider).
- **Go form:** `func NewSource(kind string, deps Deps) (Source, error)` backed by a `map[string]func(Deps) Source` registry. For families, a factory interface (`ProviderFactory { Client() …; Parser() … }`) with one implementation per family.
- **Anti-pattern:** `switch kind` creating concrete types in several places. Callers importing every concrete package.

### GOF-C2 Builder
- **Trigger:** the anti-pattern is visible: call sites pass several `nil` or zero placeholder arguments, there are telescoping `NewX` / `NewXWithY` constructors, or exported config fields are changed after construction. Multi-step assembly with validation at the end is also a trigger. A parameter count on its own is **not** a trigger.
- **Go form:** functional options (`New(req, WithA(…), WithB(…))`) for optional config. A builder type with chained methods and a final `Build() (T, error)` for step-by-step assembly (queries, requests, test fixtures).
- **Anti-pattern:** constructors with long parameter lists, many `nil`/zero arguments, exported config structs changed after construction, telescoping `NewX`, `NewXWithY`, `NewXWithYAndZ`.

### GOF-C3 Singleton
- **Trigger:** exactly one shared instance is needed (connection pool, cache, client).
- **Go form:** create it **once in the composition root** and inject it (DI-H4). Use `sync.Once` only for lazy initialization of immutable package data.
- **Anti-pattern:** a package-level `var instance` with a `GetInstance()`, global clients, or `sync.Once`-guarded mutable globals reached from logic. The global singleton is itself the finding.

### GOF-C4 Prototype
- **Trigger:** copying a configured object with nested reference fields (slices, maps, pointers), where a shallow copy would share mutable state.
- **Go form:** an explicit `Clone() *T` method that deep-copies the reference fields.
- **Anti-pattern:** `copy := *orig` on structs with slice/map/pointer fields and then changing the copy.

## Structural

### GOF-S1 Adapter
- **Trigger:** code uses a third-party SDK, an external API, or a legacy or global component whose interface differs from what the domain needs.
- **Go form:** the domain declares the interface it wants (DIP). An adapter struct wraps the SDK/client and maps vendor types to domain types and vendor errors to domain errors.
- **Anti-pattern:** vendor types and calls spread through business logic. Domain signatures that contain vendor types (DIP-3).

### GOF-S2 Decorator
- **Trigger:** a cross-cutting concern (retry, logging, metrics, caching, rate limiting, auth, tracing) whose code is **repeated in two or more operations**, or is mixed into business logic when the project already has a wrapper for it. A single log line or metric call in a method is not a trigger.
- **Go form:** a type that implements the same interface and wraps an inner one: `type retrying struct{ next Fetcher; … }`. For HTTP, `func(http.Handler) http.Handler` middleware or an `http.RoundTripper` wrapper. Decorators are stacked at the composition root.
- **Anti-pattern:** retry loops, logging or caching code mixed into the business method itself, or copied into several methods.

### GOF-S3 Facade
- **Trigger:** callers must coordinate several components of one subsystem in a fixed sequence to do one job.
- **Go form:** one type with a small API (`Sync(ctx, scope)`) that coordinates the parts, which are injected.
- **Anti-pattern:** the same multi-step orchestration repeated in several callers.

### GOF-S4 Proxy
- **Trigger:** controlling access to an object: lazy creation of something expensive, access checks, remote access, or a local cache in front of a remote one.
- **Go form:** a type with the same interface that controls when or whether calls reach the real object.
- **Anti-pattern:** `if x == nil { x = expensiveInit() }` and permission checks spread across callers.

### GOF-S5 Composite
- **Trigger:** tree structures where leaves and groups should be treated the same (rules made of rules, nested filters, a validator built from validators).
- **Go form:** one interface implemented by both the leaf type and a group type holding `[]Component`. Common Go forms are `type Multi []Validator` with a `Validate` method, or `errors.Join`.
- **Anti-pattern:** callers checking "is this a group?" and recursing by hand.

### GOF-S6 Bridge
- **Trigger:** two dimensions vary independently (e.g. export format × destination), which would otherwise multiply types (`CSVToS3`, `CSVToFile`, `JSONToS3` …).
- **Go form:** two interfaces (`Encoder`, `Sink`) composed in one struct.
- **Anti-pattern:** one type per combination.

### GOF-S7 Flyweight
- **Trigger:** many objects sharing the same immutable data (lookup tables, interned strings, shared configs) where copies cost real memory.
- **Go form:** shared immutable values handed out by a cache or table, plus per-object state kept separately.
- **Anti-pattern:** rebuilding or duplicating large identical immutable data per item.

## Behavioral

### GOF-B1 Strategy
- **Trigger:** one operation with several interchangeable algorithms chosen by config or kind (pricing rules, ID schemes, retry backoff, mapping per source type), where either:
  - the same `switch`/`if`-chain on that kind appears in **two or more places**; or
  - the diff adds a case to an existing switch on a clearly **open** set (sources, providers, plugins, formats).
  A single `switch` that maps a closed enum to values (status mapping, type normalization, the kind found in converters) is **not** a trigger (see the OCP closed-set note).
- **Go form:** a small interface or a func type (`type Backoff func(attempt int) time.Duration`) injected into the consumer, and chosen by a factory (GOF-C1) if needed.
- **Anti-pattern:** `switch mode` or `if kind ==` chains inside the algorithm, and boolean mode flags (GO-P6).

### GOF-B2 Template Method
- **Trigger:** a fixed skeleton (load → transform → save, paginate → decode → emit) that is **written out in two or more places** and differs only in some steps. One occurrence is not a trigger, and neither is a skeleton already provided by a framework helper.
- **Go form:** Go has no inheritance, so use **composition**. A runner type owns the skeleton and takes a step interface (`type Steps interface{ Fetch(…); Map(…) }`) or func fields for the parts that vary.
- **Anti-pattern:** the same skeleton copied with small edits in each variant, or embedding a "base struct" and expecting overridden methods to be called (they won't be).

### GOF-B3 Observer
- **Trigger:** one component must notify a changing set of others about events, without depending on them.
- **Go form:** a `Subscriber` interface, or `func(Event)` handlers registered with the subject, or channels where each subscriber's lifetime is clear. Delivery semantics (sync/async, ordering, what happens on a slow subscriber) are documented.
- **Anti-pattern:** the subject calling concrete downstream components directly, or adding a call for every new consumer (OCP).

### GOF-B4 Command
- **Trigger:** operations that must be queued, retried, scheduled, logged, undone or run by a generic executor.
- **Go form:** `type Command interface{ Run(ctx context.Context) error }`, or `func(ctx context.Context) error`, plus an executor that takes them.
- **Anti-pattern:** executors that switch on an operation name to decide what to run.

### GOF-B5 Chain of Responsibility
- **Trigger:** a request passes through ordered handlers, each of which may handle it, change it or pass it on (validation pipelines, middleware, parser fallbacks).
- **Go form:** handlers that wrap `next` (as in middleware), or a `[]Handler` where each returns `(handled bool, err error)`.
- **Anti-pattern:** one long function with sequential `if` checks for every case.

### GOF-B6 State
- **Trigger:** behavior depends on a lifecycle state with explicit transitions (pending → running → done/failed), checked in several methods.
- **Go form:** a `State` interface with one type per state, each returning the next state. Or a transition table `map[State]map[Event]State` with illegal transitions rejected in one place.
- **Anti-pattern:** "flag soup" (`isRunning`, `isDone`, `failed` bools) and `if state == …` checks repeated in several methods.

### GOF-B7 Iterator
- **Trigger:** an **unbounded or large** collection (a paged API across all pages, a DB table, a stream) that is loaded fully into memory when a cursor, iterator or framework helper is available, **or** pagination tokens that are exposed to callers. Bounded slices are **not** triggers: one API page, one batch, a fixed-size config list, rows for one scope that are capped by design.
- **Go form:** a cursor with `Next() bool` / `Value() T` / `Err() error` (the `bufio.Scanner` / `sql.Rows` shape), or `iter.Seq[T]` if the module is on Go 1.23+.
- **Anti-pattern:** loading the whole unbounded collection into a slice before processing, or exposing pagination tokens to every caller.

### GOF-B8 Mediator
- **Trigger:** several components talk to each other in many-to-many ways.
- **Go form:** one coordinator type that the components report to. They don't hold references to each other.
- **Anti-pattern:** components holding pointers to each other in both directions.

### GOF-B9 Memento
- **Trigger:** state must be saved and restored (checkpoints, resumable syncs, undo).
- **Go form:** an opaque snapshot value (`Checkpoint`) produced and consumed by the owner. Callers store it but don't look inside.
- **Anti-pattern:** callers reaching into internal fields to save and restore them.

### GOF-B10 Visitor
- **Trigger:** several unrelated operations over a fixed set of node types (ASTs, schema trees) that keep changing.
- **Go form:** a `Visitor` interface with a method per node type, and `Accept(v Visitor)` on the nodes. Or a single type switch in one walker function, when the node types are closed.
- **Anti-pattern:** the same type switch over node types repeated in many functions.

### GOF-B11 Interpreter
- **Trigger:** evaluating a small language or rule grammar (filter expressions, query DSLs).
- **Go form:** an `Expr` interface with `Eval(env) (Value, error)`, one type per grammar rule, built by a parser.
- **Anti-pattern:** string-splitting and ad-hoc `if` evaluation of expressions.

## GOF-X — Misuse

Misusing a pattern is a finding, just as missing one is:
- **X1 Pattern without its trigger:** an interface with one implementation and no consumer that needs substitution (testing counts as a consumer: see DI-T1); a factory that always builds the same type; a builder for a two-field struct.
- **X2 Broken structure:** a decorator that doesn't implement the wrapped interface; a strategy chosen by a `switch` inside the consumer anyway; an observer with no unsubscribe or no stated delivery order; a state machine whose transitions are spread across callers.
- **X3 Java-style emulation:** abstract base structs with "virtual" method fields used as inheritance, `I`-prefixed interface names, `…Impl` types, getters and setters for every field.
- **X4 Wrong pattern for the problem:** e.g. Observer for a one-to-one call, or Singleton where injection would do.
