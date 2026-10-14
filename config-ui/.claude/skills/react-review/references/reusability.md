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

# Reusability, DRY & Single Source of Truth

## Contents
1. Duplicate code and duplicate logic
2. Choosing the reuse tool
3. Strategy pattern for type-based branching
4. Registry + lazy loading
5. No loose strings or magic numbers
6. Single source of truth
7. Merging similar objects
8. Splitting large objects

## 1. Duplicate code and duplicate logic

Search beyond the diff — grep the repo for similar function names, similar JSX blocks, repeated literals and repeated hook sequences. A "new" helper often duplicates one already in `shared/utils`.

- **Duplicate code**: copy-pasted JSX, handlers, effects, styled blocks.
- **Duplicate logic**: the same rule implemented differently — two date formatters, two `status → colour` maps, filtering done in both a hook and a component, validation in both form and service. This is worse than copy-paste because it's harder to spot and the copies drift.
- Repeated `useState(loading) / useState(error) / try / finally` sequences are duplicate logic → `useFetch` / `useConfirmClick` (see errors-async.md).

Rule of thumb: two occurrences → consider extracting; three → extract. Don't extract when the result needs a flag per caller — that's coupling dressed up as reuse.

## 2. Choosing the reuse tool

Prefer the earliest option that fits:

1. **Pure util / generic function** — stateless logic. Use TypeScript generics instead of one copy per type:
   ```ts
   export const groupBy = <T, K extends PropertyKey>(items: T[], getKey: (item: T) => K) =>
     items.reduce((acc, item) => {
       (acc[getKey(item)] ||= []).push(item);
       return acc;
     }, {} as Record<K, T[]>);
   ```
2. **Custom hook** — stateful logic and effects. This is the default reuse mechanism in modern React.
3. **Component** with props, `children`, or compound components (`<Tabs><Tabs.Item/></Tabs>`) — repeated UI.
4. **HOC** — cross-cutting *wrapping* applied to many components: auth/permission guards, error boundaries, analytics. Flag HOCs used for logic a hook could provide (they obscure props and stack poorly).
5. **Render props** — when the consumer must control rendering of state owned by the provider and a hook can't express it (virtualized lists, headless libraries). Flag render props that could simply be a hook.
6. **Callbacks** — pass behaviour in (`onSuccess`, `renderItem`, `getLabel`, `onError`) instead of branching on who the caller is.

## 3. Strategy pattern for type-based branching

`if/else` or `switch` on `type`, `kind`, `status`, `mode`, `variant` that picks a behaviour, component or value → replace with a map. Adding a variant becomes adding an entry, not editing logic (open/closed).

```tsx
// before
if (field.type === 'text') return <TextInput {...field} />;
else if (field.type === 'select') return <Select {...field} />;
else if (field.type === 'date') return <DatePicker {...field} />;

// after — constants/index.ts
export const FIELD_COMPONENTS = {
  text: TextInput,
  select: Select,
  date: DatePicker,
} as const satisfies Record<FieldType, ComponentType<FieldProps>>;

// component
const Field = FIELD_COMPONENTS[field.type];
return <Field {...field} />;
```

The same applies to behaviour (`STATUS_HANDLERS[status](payload)`) and values (`STATUS_COLORS[status]`). Typing the map with `Record<Union, …>` makes the compiler catch a missing variant.

Two-way `if/else` on a boolean is fine — don't flag it.

## 4. Registry + lazy loading

When variants are many or heavy (plugins, dashboard widgets, connection forms, chart types), use a **registry** whose entries are lazy imports, so only the chunk for the variant in use is downloaded:

```tsx
export const WIDGET_REGISTRY: Record<WidgetType, LazyExoticComponent<ComponentType<WidgetProps>>> = {
  chart: lazy(() => import('./widgets/chart')),
  table: lazy(() => import('./widgets/table')),
  map: lazy(() => import('./widgets/map')),
};

const Widget = WIDGET_REGISTRY[type];
return (
  <Suspense fallback={<WidgetSkeleton />}>
    <Widget {...props} />
  </Suspense>
);
```

Flag: a central file that statically imports every variant (all chunks ship to every user); registries that features can't extend without editing a core file. For plugin-style systems, recommend dependency injection — features register themselves (`registerWidget('map', …)`) or the registry is provided via context — so the core doesn't import features.

## 5. No loose strings or magic numbers

Move meaningful literals into `constants/` (module) or `shared/constants/` (cross-module):

- route paths, API endpoints, query/cache keys, storage keys, event names
- status/type/role values compared in logic (`if (status === 'active')`)
- error and validation messages, toast messages
- durations, limits, page sizes, breakpoints, retry counts
- test ids used in more than one place

Use `as const` so values stay literal types, and derive types from them:

```ts
export const USER_STATUS = { ACTIVE: 'active', SUSPENDED: 'suspended' } as const;
export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];
```

Not every string is "loose": one-off UI copy belongs in i18n (if the project has it) rather than constants; CSS class names and `aria-*` values are fine inline.

## 6. Single source of truth

One piece of knowledge lives in one place; everything else derives from it.

```ts
// before — parallel objects that must be kept in sync by hand
const abc = { aligner: 'title' };
const xyz = { aligner: 'subtitle' };

// after
export const ALIGNER = { title: 'title', subtitle: 'subtitle' } as const;
```

Common violations:
- Parallel arrays/maps keyed by the same values (`STATUS_LABELS`, `STATUS_COLORS`, `STATUS_ICONS`) → one map of objects: `STATUS_META[status].label/.color/.icon`.
- Select `options` arrays duplicated from a constant map → derive: `Object.entries(STATUS_META).map(([value, { label }]) => ({ value, label }))`.
- TypeScript unions retyped by hand next to the constant they mirror → derive with `typeof`.
- Server data copied into local state and edited there while the original stays in a cache → one owner.

## 7. Merging similar objects

Objects with the same shape **that belong to the same domain** should be one object:

```ts
// before
const a = { label: 'Active', value: 'active' };
const b = { label: 'Inactive', value: 'inactive' };

// after
export const STATUS_OPTIONS = {
  active: { label: 'Active', value: 'active' },
  inactive: { label: 'Inactive', value: 'inactive' },
} as const;
```

Do **not** merge objects from different domains just because they share a shape (e.g. `{ label, value }` for user roles and for chart colours). That creates coupling between unrelated modules — a change for one forces a change for the other. Same domain → merge; different domain → keep separate.

## 8. Splitting large objects

When a merged object grows too large (app config, table column definitions, form schemas), split it into domain slices in separate files and compose with spread:

```ts
// constants/table-config.ts, constants/form-config.ts, constants/chart-config.ts
// constants/index.ts
export const APP_CONFIG = { ...TABLE_CONFIG, ...FORM_CONFIG, ...CHART_CONFIG };
```

Spread is **shallow**: a key repeated across slices silently overwrites the earlier one, and nested objects are replaced, not merged. Flag duplicate top-level keys between slices; when keys could clash, namespace instead:

```ts
export const APP_CONFIG = { table: TABLE_CONFIG, form: FORM_CONFIG, chart: CHART_CONFIG };
```
