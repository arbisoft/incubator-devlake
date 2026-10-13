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

# Performance

If the project uses the React Compiler, skip manual `useMemo`/`useCallback`/`React.memo` findings — the compiler handles them.

## useMemo / useCallback / React.memo

**Required** (flag when missing):
- A callback or object/array passed as a prop to a `React.memo` child — without it, the memo is useless.
- A value or function used in the dependency array of `useEffect`, `useMemo`, `useCallback` or a custom hook — otherwise the effect re-runs every render (and can loop).
- A context provider `value`.
- Expensive computations: sorting/filtering/grouping large lists, heavy transforms, building big lookup maps.
- Values returned from custom hooks that consumers are likely to put in deps.

**Overuse** (flag as ⚪/🟡):
- Memoizing primitives or trivial expressions (`useMemo(() => a + b)`).
- `useCallback` for handlers passed only to native DOM elements.
- Memo hooks whose deps change every render anyway (inline object/array in deps) — they add cost and do nothing.
- `React.memo` on components that always receive new props.

Explain the concrete effect in the finding ("`columns` is recreated each render, so `<DataTable>`'s memo never hits and the 2k-row table re-renders on every keystroke").

## Re-renders

- Inline object/array/function props to memoized children.
- Default parameter values creating new references every render (`({ items = [] })`) → module-level `EMPTY_ITEMS` constant.
- Context value recreated every render; one big context where a small piece changes often → split.
- State held too high, so typing in one input re-renders a large tree → colocate state in the smallest owner.

## Lists

- `key` must be a stable id. Index keys are a bug when items can be reordered, filtered, inserted or removed (state attaches to the wrong row). `Math.random()`/`Date.now()` keys remount every render.
- Long lists (> ~100–200 rows, or heavy rows) → virtualization (`react-window`, `@tanstack/react-virtual`, or the table library's virtual mode).

## Code splitting

- Routes are lazy-loaded (`lazy(() => import(...))` + `Suspense`).
- Heavy, rarely used components (charts, rich editors, PDF viewers, maps) are lazy.
- Variant-heavy UIs use a lazy registry (see reusability.md) instead of a central file statically importing every variant.
- Heavy dependencies: whole-library imports (`import _ from 'lodash'`, full icon sets, moment) → per-method / tree-shakeable imports or lighter alternatives.

## Other

- Debounce/throttle input, scroll and resize handlers that trigger work or requests.
- Expensive work in the render body that runs every render → `useMemo` or move out of the component (module-level constant if it doesn't depend on props).
- Images without dimensions (layout shift) or not lazy-loaded below the fold.
