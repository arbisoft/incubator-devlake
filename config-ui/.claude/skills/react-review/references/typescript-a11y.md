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

# TypeScript & Accessibility

## TypeScript

- **No `any`.** Use `unknown` and narrow, or a proper type. Implicit `any` from untyped params counts.
- **No silencing casts.** `as Foo` to make an error go away, `as unknown as Foo`, and non-null `!` hide real bugs. Narrow with guards instead.
- **No `@ts-ignore`.** If truly unavoidable, `@ts-expect-error` with a reason comment.
- **Discriminated unions for variants** instead of a bag of optional props:
  ```ts
  // before
  type Props = { kind: string; url?: string; onClick?: () => void };
  // after
  type Props = { kind: 'link'; url: string } | { kind: 'action'; onClick: () => void };
  ```
- **`as const` objects instead of `enum`**, and derive union types from them (see reusability.md).
- **Typed API layer.** Responses typed as DTOs and mapped to domain types in `service/`; components never see raw response shapes.
- **Props:** `type XxxProps` per component; extend native props when wrapping elements (`ComponentProps<'button'>`).
- **Generics** for reusable components/hooks (`Table<T>`, `useFetch<T>`) instead of copies per type.
- **Exported service/util functions** declare return types, so accidental shape changes break at the definition, not at call sites.
- `Record<Union, …>` / `satisfies` on strategy maps so a missing variant is a compile error.

## Accessibility

- **Semantic elements.** `<button>` for actions, `<a href>` for navigation. `<div onClick>` is not keyboard- or screen-reader-accessible → 🟠.
- **Keyboard.** Everything clickable is reachable with Tab and operable with Enter/Space; no positive `tabIndex`.
- **Labels.** Every input has an associated `<label>` (or `aria-label`/`aria-labelledby`). Icon-only buttons have `aria-label`.
- **Images.** Meaningful `alt`; decorative images `alt=""`.
- **Dialogs.** `role="dialog"`, `aria-modal="true"`, labelled by the title; focus moves in on open, is trapped while open, `Esc` closes, focus returns to the trigger on close.
- **Live updates.** Toasts and async status messages use `role="status"`/`aria-live="polite"`; errors `role="alert"`.
- **Forms.** Errors associated with fields via `aria-describedby`, `aria-invalid` on invalid fields.
- **Colour** isn't the only signal (status badges also have text/icon); contrast meets WCAG AA.
- **Headings** follow a logical order; one `h1` per page.

If the project has `eslint-plugin-jsx-a11y`, rely on it for the mechanical checks and focus on dialogs, focus management and semantics.
