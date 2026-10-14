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

# State, Data Fetching & Popups

## Contents
1. Where state lives
2. Prop drilling
3. Derived state and resets
4. RTK / RTK Query vs useFetch
5. Toasts
6. Modals and popups

## 1. Where state lives

| Scope of use | Tool |
|---|---|
| One component | `useState` / `useReducer` |
| A few siblings | lift to nearest common parent |
| One feature (many components inside one module) | feature **Context**, provider at the feature root, in `features/<name>/context/` |
| Whole app, across features (auth user, permissions, theme, locale, global settings) | **Redux** |

Redux is only for state that genuinely belongs to the whole app. Flag:
- A Redux slice read and written by only one feature → move to that feature's context or local state.
- Form state, modal open flags, filters, selection, pagination of a single screen in Redux.
- Context used for app-wide state that changes often and is read in many places (re-render storms) → Redux or a split context.

Context hygiene:
- Memoize the provider `value` (`useMemo`) so consumers don't re-render every parent render.
- Split contexts when one part changes frequently and another rarely (state vs dispatch/actions).
- Expose a `useXxx()` hook that throws if used outside the provider, rather than exporting the raw context.

## 2. Prop drilling

A prop passed through two or more components that don't use it themselves → fix with:
1. **Composition first** — pass the rendered element as `children` or a slot prop so intermediate components never see the data.
2. **Feature context** — when many descendants need it.

Don't reach for Redux to fix drilling inside a single feature.

## 3. Derived state and resets

- Don't store what can be computed from props/state (`fullName`, `filteredItems`, `isValid`). Compute during render, `useMemo` if expensive.
- Don't copy props into state and sync with `useEffect` — it lags a render and drifts. Either use the prop directly, or make the component controlled.
- To reset a component's state when an identity changes, pass `key={id}` rather than an effect that resets fields.

## 4. RTK / RTK Query vs useFetch

The same app-wide rule applies to fetched data:

- **RTK Query / thunks** only for data used across the app: current user, permissions, shared lookups and enums used by several features.
- **Feature or component data** → `useFetch`/`useAxios` inside a feature hook, calling the feature's `service/`. These hooks are built on `useErrorHandler`, so loading/error handling stays central (see errors-async.md).

Flag:
- RTK Query endpoints or thunks consumed by a single feature or component.
- Thunks that put component-only data in the global store.
- Raw `axios`/`fetch` in components, or `useEffect` + `useState` fetch sequences → `useFetch`.

When something is flagged as "not app-wide", say how you checked (grep for the selector/hook usages) and tag **(verify)** if usage is ambiguous.

## 5. Toasts

Toasts are solved once, centrally:

- A single `ToastProvider` in `app/` renders through `createPortal` into one container, owns the queue, and **unmounts** each toast on dismiss or timeout.
- Components call `const toast = useToast(); toast.success(MESSAGES.SAVED);` — they never render toast markup or keep `showToast` state.
- `useErrorHandler` uses the same toast API for error messages.
- Container uses `role="status"` / `aria-live="polite"` (errors: `role="alert"`).

Flag: toast JSX in feature components; local `useState` for toast visibility; more than one toast container; toasts hidden with CSS/`visible={false}` while staying mounted; toast messages as loose strings.

## 6. Modals and popups

The base `Modal` (in `shared/ui/modal/`) owns the portal and the unmount, so call sites don't repeat it:

```tsx
export const Modal = ({ open, onClose, children, ...rest }: ModalProps) => {
  if (!open) return null; // unmounts children → fresh state and props on every open
  return createPortal(
    <div role="dialog" aria-modal="true" {...rest}>
      {children}
    </div>,
    document.body,
  );
};

// call site — just pass `open`
<EditUserModal open={isEditOpen} user={selectedUser} onClose={closeEdit} />
```

Rules:
- Call sites pass `open` / `onClose`; they don't wrap in `{open && <Modal/>}` — that logic belongs to the base component.
- Closing destroys the content, so reopening always reflects the latest props. A modal hidden with CSS or a `visible` prop while staying mounted keeps stale form state — flag it.
- An effect that resets modal fields "on open" is a symptom of the above; the fix is unmounting, not the effect.
- Multiple simultaneous instances (stacked dialogs, popovers per row) each get their own portal entry; consider a `ModalProvider` + `useModal()` for imperatively opened dialogs with props, instead of one boolean per dialog in the parent.
- Accessibility: focus moves into the dialog, is trapped, `Esc` closes, focus returns to the trigger on close (see typescript-a11y.md).
