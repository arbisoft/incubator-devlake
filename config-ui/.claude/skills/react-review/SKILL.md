---
name: react-review
description: Review React / TypeScript frontend code against a strict architecture and quality standard — modular domain-driven folders and layers, DRY and reusability (custom hooks, HOCs, strategy and registry patterns, single-source-of-truth constants), centralized error handling (useErrorHandler, useFetch/useAxios, interceptors, Error Boundary), correct Redux/RTK vs context vs local state, portal-based modals and toasts, security (XSS, token storage), naming conventions, TypeScript, accessibility and performance (useMemo/useCallback). Use this skill whenever the user asks to review, audit, critique or check React, TSX/JSX, hooks or frontend code, a frontend PR, branch or diff, or asks things like "is this component well structured", "anything wrong with this React code", "how can I make this more reusable", or wants refactoring suggestions for a React codebase — even if they never say the word "review".
---

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

# React Code Review

Review React code for architecture, reusability, correctness and security, and report concrete, fixable findings. The standard below is opinionated on purpose: the goal is a codebase where every module looks the same, logic exists once, and cross-cutting concerns (errors, loading, popups, data fetching) are solved centrally instead of re-implemented per component.

## 1. Determine scope

- Arguments name files, folders, a PR number or a branch → review exactly that (PR: `gh pr diff <n>`; branch: `git diff --merge-base <base> <branch>`).
- No arguments → review changed code: `git diff --merge-base main` plus uncommitted changes, filtered to `.ts .tsx .js .jsx`.
- Read every changed file **in full**, plus its module siblings (`constants/`, `service/`, `hooks/`, sibling components). Duplication, single-source-of-truth and structure problems are invisible in a diff hunk.
- Focus findings on changed code. Pre-existing problems in untouched code go in a short "Pre-existing" list at the end, except security issues, which are always reported in full.

## 2. Learn the project before judging it

Spend a minute discovering what already exists, so recommendations reuse it instead of inventing parallel solutions:

- Grep for shared building blocks: `useErrorHandler`, `useFetch`, `useAxios`, `useConfirmClick`, `ErrorBoundary`, `interceptors`, `ToastProvider`/`useToast`, the base `Modal`, `shared/` or `common/` folders, constants folders.
  - If a building block exists → findings say "use `useFetch` from `shared/hooks`".
  - If it's missing → recommend creating it **once** (in "Suggested shared building blocks"), and reference that in the individual findings instead of repeating the full sketch each time.
- Note the state tools (Redux, RTK Query, React Query, context), i18n library, router, and whether the React Compiler is enabled (if so, skip manual memoization findings).
- Check the ESLint config. Don't report what a configured lint rule already enforces. If a mechanical rule is violated repeatedly and no lint rule covers it, list every instance in the changed code as one grouped finding **and** recommend the lint rule.
- Existing code is not the standard. If the repo already breaks a rule (e.g. local constants in `SCREAMING_SNAKE_CASE` everywhere), still flag it in changed code; precedent goes in "Pre-existing", it never exempts new code.

## 3. Mechanical sweep, file by file

Before the area review, walk **every changed file top to bottom**, including demos, stories, tests and page objects, and check each declaration and JSX block against this list. These are cheap to spot and easy to skip when attention goes to bigger issues, so do them deliberately:

| Check | Rule | Reference |
|---|---|---|
| Every top-level `const` | `SCREAMING_SNAKE_CASE` only if **exported**; non-exported → `camelCase` | naming.md |
| Every alias of a nested path (`const x = COPY.a.b`) and every function reading ≥2 fields of one object | Destructure: `const { options } = COPY.snippet`, `({ rawMb, monthlyMb }) =>` | maintainability.md → Idioms |
| Every `cond ? <X/> : null` / `cond ? value : null` in JSX | `cond && …` when `cond` is boolean | maintainability.md → Idioms |
| Sibling JSX blocks that differ only in props/data | Config array + `.map` | maintainability.md → Idioms |
| What each file exports | Constants/data **or** functions **or** a component — not a mix | architecture.md §2a |
| Every pair of objects/maps keyed by the same ids (ids, meta, labels, effects, handlers) | One object per id holding all of it | reusability.md §6 |

Group the hits per rule into one finding with all locations. Don't drop them as nits because the review is long — they're **Minor** and they recur in every PR until someone names them.

## 4. Review, area by area

Read the reference file for each area the code touches. Most reviews touch most areas; skip only the ones that clearly don't apply (e.g. no popups in the diff → skip the popup section).

| Area | Reference |
|---|---|
| Module/folder structure, layers, dependency direction, SOLID, coupling | [references/architecture.md](references/architecture.md) |
| DRY, duplicate code/logic, hooks/HOC/render props, strategy & registry patterns, constants, single source of truth, merging/splitting objects | [references/reusability.md](references/reusability.md) |
| Redux vs context vs local state, prop drilling, RTK Query vs useFetch, modals/toasts/portals | [references/state-data.md](references/state-data.md) |
| Error handling pipeline, try/catch, loading state, async races, effect cleanup, hook deps | [references/errors-async.md](references/errors-async.md) |
| useMemo/useCallback, re-renders, keys, code splitting, lazy registries | [references/performance.md](references/performance.md) |
| XSS, token/cookie storage, secrets, redirects, postMessage | [references/security.md](references/security.md) |
| TypeScript strictness, accessibility | [references/typescript-a11y.md](references/typescript-a11y.md) |
| Naming conventions | [references/naming.md](references/naming.md) |
| Readability, component size, dead code, styling, forms, tests, lint rules | [references/maintainability.md](references/maintainability.md) |

## 5. Severity

- 🔴 **Critical** — security holes, bugs, crashes, wrong data from races, leaks.
- 🟠 **Major** — layer/dependency violations, tight coupling, duplicated logic, scattered try/catch or loading state, wrong state tool, prop drilling, popups that stay mounted, type-switching that should be a strategy/registry.
- 🟡 **Minor** — loose strings, naming, file placement, mixed-export files, missed destructuring / `&&` / `.map` idioms, missing or unnecessary memoization, small a11y gaps.
- ⚪ **Nit** — preference-level. Drop nits entirely when there are more than ~10 higher findings; they bury the signal.

## 6. Writing findings

- **Verify before reporting.** Only report what you saw in the code. When a verdict depends on context you couldn't see (e.g. "is this slice really used app-wide?"), say what you checked and tag the finding **(verify)**.
- **Group repeats.** One finding with a list of locations beats eight identical findings.
- **Explain the consequence**, not just the rule: "two status→colour maps will drift; the table and badge already disagree on `PENDING`" is actionable, "violates DRY" is not.
- **Show the fix** with a short after-snippet (and before-snippet when it clarifies). Prefer the smallest change that satisfies the rule; propose restructuring a module only when structure *is* the finding.
- Name the rule area so the author can find it in the team standard.

## 7. Output template

Use this structure:

````markdown
# React Review: <scope>

**Summary:** <2–3 lines: overall health and the biggest risks>

| 🔴 Critical | 🟠 Major | 🟡 Minor | ⚪ Nit |
|---|---|---|---|
| n | n | n | n |

## 🔴 Critical

### 1. <short title> — `path/to/file.tsx:42`
**Area:** <e.g. Security → XSS>
**Why:** <concrete consequence>
**Fix:**
```tsx
// after
```

## 🟠 Major
...

## 🟡 Minor
...

## ⚪ Nits
...

## Suggested shared building blocks
<only when infrastructure is missing — e.g. "create `shared/hooks/use-error-handler`"; one sketch each>

## Pre-existing (outside this change)
<one line each>

## Done well
<1–3 short bullets>
````

Omit empty sections.
