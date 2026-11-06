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

# Maintainability & Readability

## Component shape

- **Size:** > ~200 lines, > ~7 props, or several unrelated responsibilities → split into a hook (logic) and smaller presentational components.
- **Boolean prop explosion** (`isPrimary`, `isLarge`, `isOutlined`, `isGhost`) → a `variant`/`size` union, or composition.
- **Nested ternaries in JSX** → early returns, a lookup map, or sub-components.
- **Deep nesting** of conditions → guard clauses.
- **Logic in JSX** (filtering, sorting, formatting, permission checks inline) → hook, util or a named variable above the return.
- Prefer `children` and slot props over configuration props that switch on what to render.

## Idioms

Check these in every changed file, including demos, stories and tests.

- **Destructure** when a function reads two or more fields of one argument, or when a local just aliases a nested path:
  ```ts
  // before
  const storageLine = (estimate: StorageEstimate) =>
    estimate.rawMb === 0 ? none : storage(estimate.rawMb, estimate.monthlyMb);
  const OPTIONS_COPY = COPY.snippet.options;
  // after
  const storageLine = ({ rawMb, monthlyMb }: StorageEstimate) => ...;
  const { options } = COPY.snippet;
  ```
- **`&&` over `? … : null`** in JSX when the condition is a boolean: `{hasSingleSignal(value) && copy.lastSignal}`. Keep the ternary (or `!!x &&` / `x > 0 &&`) when the left side can be a number or empty string, which `&&` would render as `0` / `""`.
- **Loop over repeated JSX.** Two or more sibling blocks that differ only in props or data → a config array (or map) plus `.map`, with a stable `key`. Applies to demo/ui-kit pages and test tables too:
  ```tsx
  // after
  const cases = [
    { label: COPY.cases.default, checked: plain, onChange: setPlain },
    { label: COPY.cases.disabled, checked: true, disabled: true },
  ];
  {cases.map(({ label, ...props }) => (
    <DemoCase key={label} label={label}><SettingOption {...base} {...props} /></DemoCase>
  ))}
  ```
  Don't force it when the blocks differ in structure (e.g. one has nested children); extract the repeated part instead.

## Hygiene

- Dead code: unused imports, exports, props, state, files; commented-out blocks.
- `console.log`, `debugger`, leftover test data.
- `TODO`/`FIXME` without a ticket reference.
- Comments that restate the code; comments should explain *why*.
- **Immutability:** no mutation of props or state (`push`, `splice`, in-place `sort`/`reverse`, assigning to nested fields). Use spread, `toSorted`, `map`/`filter`.

## Consistency

- **i18n:** if the project uses an i18n library, user-facing strings go through it.
- **Styling:** use theme/design tokens; flag hard-coded colours and repeated pixel values, and inline `style` objects for static styles.
- **Forms:** non-trivial forms use the project's form library with schema validation (zod/yup) instead of hand-rolled `useState` per field and ad hoc validation.
- **Loading / empty / error states** use shared components (see errors-async.md).

## Tests

- New hooks, utils, services and non-trivial components have tests.
- React Testing Library queries by role/label/text, not by class names or implementation details.
- Tests cover behaviour (what the user sees and does), including error and empty states.

## Dependencies

- New dependencies are justified and don't duplicate an existing one (two date libraries, two HTTP clients, lodash + ramda).

## Lint rules to recommend

When mechanical violations repeat and no rule covers them, recommend the rule once:

| Problem | Rule / plugin |
|---|---|
| Cross-feature / deep imports, layer violations | `eslint-plugin-boundaries`, `no-restricted-imports` |
| Naming conventions | `@typescript-eslint/naming-convention` |
| Folder/file naming | `eslint-plugin-check-file` |
| Hook deps, rules of hooks | `eslint-plugin-react-hooks` |
| Accessibility | `eslint-plugin-jsx-a11y` |
| `dangerouslySetInnerHTML` | `react/no-danger` |
| `any`, unsafe casts | `@typescript-eslint/no-explicit-any`, `no-unsafe-*`, `no-non-null-assertion` |
| Console statements | `no-console` |
| Magic numbers | `@typescript-eslint/no-magic-numbers` (with sensible ignores) |
| Floating promises | `@typescript-eslint/no-floating-promises` |
