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

# Architecture, Folder Structure & Layers

## Contents
1. Module layout
2. Component file rule
3. Folder-per-concern rule
4. Dependency direction
5. When code moves to `shared/`
6. Layers inside a feature
7. Barrels
8. SOLID in React
9. Loose coupling

## 1. Module layout

Group code by **feature (domain)**, not by file type. Everything a feature needs lives inside it; only code used by two or more features lives in `shared/`; app wiring lives in `app/`.

```
src/
  app/                          # providers, router, store, root ErrorBoundary, interceptor setup
  features/
    user-form/
      index.ts                  # public API — the ONLY path other modules import from
      components/
        user-form/index.tsx     # main component
        user-form-row/index.tsx # private sub-component
      constants/index.ts
      types/index.ts
      service/index.ts          # API calls + DTO → domain mapping
      hooks/
        index.ts                # re-exports
        use-user-form.ts
      utils/index.ts
      context/index.tsx         # feature-scoped context, if any
  shared/
    ui/  hooks/  utils/  api/  constants/  types/
```

Findings to raise:
- Files grouped by type at the top level (`src/components`, `src/hooks`, `src/utils` holding feature-specific code) → move into the owning feature.
- Feature-specific constants/services/hooks living in root `shared/` → move into the feature.
- `index.ts` and `index.tsx` in the same folder → ambiguous resolution; the feature root has `index.ts` (public API), components live under `components/<name>/index.tsx`.
- Nesting deeper than ~3 levels below `features/<name>/` → flatten; deep trees signal a sub-feature that should be its own module.

## 2. Component file rule

A component lives in a lowercase kebab-case folder as `index.tsx`, and that file contains **only the component**.

- Any **exported** function, constant, type or hook in the component file → move to the module's `utils/`, `constants/`, `types/`, `hooks/`.
- Non-exported constants that are configuration (option lists, column definitions, maps) → `constants/`, so they have one home and can be reused.
- A tiny non-exported render helper used only by this component is fine; if it grows or is reused, make it a sub-component folder.
- The props type may stay in the file if it's not exported; if other files need it, move it to `types/`.

Why: a file that only holds the component is predictable to navigate, fast-refresh works reliably (mixed exports break React Fast Refresh), and shared things don't hide inside UI files.

## 2a. One job per file

The same rule applies to non-component files: a file exports **one kind** of thing.

- `constants` — data only: id maps, meta/config objects, copy, defaults.
- `utils` — functions only (pure), importing their data from `constants`.
- `types` — types only.

Flag any `.ts` file that exports both constant data and functions (e.g. `managed-settings.ts` exporting `DEFAULT_SETTINGS_SELECTION` / `TOP_LEVEL_OPTIONS` alongside `buildManagedSettings` / `estimateStorage`) → move the data to the module's constants and keep the functions in utils. A non-exported constant used only by one function may stay next to it; anything exported or shared moves.

Why: readers know where to look, constants can be imported without pulling in logic, and tests of the logic don't depend on where data lives.

## 3. Folder-per-concern rule

Every concern is a folder with `index.ts`: `constants/index.ts`, `service/index.ts`, `types/index.ts`, `utils/index.ts`, `hooks/index.ts`. Apply it uniformly — don't mix `service/index.ts` in one module with `constants.ts` in another.

When a concern grows, split inside the folder (`service/user.ts`, `service/role.ts`) and let `index.ts` re-export by name. Import paths stay stable, so callers don't change.

Flag: inconsistent shapes between modules; a single `index.ts` that has grown past ~200–300 lines with unrelated groups.

## 4. Dependency direction

```
app  →  features  →  shared
```

- `shared/` never imports from `features/` or `app/`.
- Features don't import from each other. If two features need the same thing, it moves to `shared/`; if a screen combines two features, the composition happens in `app/` (routes/pages), passing data through props.
- No deep imports into another module (`features/billing/components/invoice-row`) — only through its `index.ts`.

These are the most valuable rules to automate. If the project lacks enforcement, recommend `eslint-plugin-boundaries` or `no-restricted-imports` patterns once.

## 5. When code moves to `shared/`

Only when **two or more features** actually use it. Speculative "might be reused" code in `shared/` turns it into a junk drawer and inverts the coupling — every feature ends up depending on a grab-bag of half-generic helpers. Conversely, flag code duplicated across two features that should now be promoted.

## 6. Layers inside a feature

```
component  →  hook  →  service  →  http client (shared/api)
```

- **Components** render and wire events. No `axios`/`fetch` calls, no response transformation, no business rules in JSX.
- **Hooks** are the only bridge between React and services: they call services through `useFetch`/`useAxios`, hold state, expose a small API to the component.
- **Services** are plain TypeScript: build the request, call the shared http client, map DTO → domain type. No React imports, no toasts, no try/catch (errors flow to the interceptor/handler).
- **Utils** are pure functions.

Flag any layer skipping (component calling axios), reversed dependency (service importing a hook or toast), or logic in the wrong layer (date formatting / sorting / filtering inside JSX).

## 7. Barrels

- `index.ts` uses named re-exports (`export { UserForm } from './components/user-form'`). Avoid `export *` from large modules — it hides what's public, defeats tree-shaking in some setups and creates circular import chains.
- Watch for cycles: a module importing its own barrel (`import { X } from '..'` inside the feature) is a common cause. Internal files import siblings directly; the barrel is for outsiders.

## 8. SOLID in React

- **Single responsibility** — a component either orchestrates (data + state via a hook) or renders. Warning signs: >~200 lines, several unrelated `useState`/`useEffect` groups, a name with "And" in it. Split into a hook + presentational components.
- **Open/closed** — adding a new variant shouldn't mean editing a growing `switch`. Use a strategy map or registry (see reusability.md) or composition (`children`, render slots).
- **Liskov** — wrapper components accept and forward the base element's props (`type Props = ComponentProps<'button'> & {...}`, spread `...rest`), so a `PrimaryButton` can stand in anywhere a `button` can.
- **Interface segregation** — props are small and specific. Passing a whole `user` object when the component needs `name` and `avatarUrl` couples it to the full shape; "god props" objects and >~7 props are smells.
- **Dependency inversion** — components depend on abstractions (callbacks, hooks, context-provided services) rather than importing concrete implementations deep in the tree. This is what makes a component testable and reusable in another context.

## 9. Loose coupling

- Components shouldn't know where data comes from; they receive data and callbacks.
- Siblings communicate through their parent (lifted state / callbacks) or feature context — never by reaching into each other's internals, refs or module-level mutable variables.
- Shared abstractions that need a flag per caller (`isFromBilling`, `mode === 'settings'`) are coupled to their callers; invert with callbacks, render slots or a strategy map.
