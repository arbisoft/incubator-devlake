---
name: devlake-frontend-standards
description: Coding style, architecture and quality gates for the DevLake fork's Config UI (config-ui/, React 19 + antd 6 + styled-components + Vitest + Playwright). Use before writing, editing or reviewing any config-ui code or e2e test — components, routes, src/ui, copy, styling, tests, lint/knip/jscpd gates.
origin: custom
---

# DevLake Config UI standards

These are the binding rules, condensed.

Work from `config-ui/` with `corepack yarn` (Node 24, Yarn 4).

## Layers: where code may change
| Layer | Rule |
|---|---|
| `src/api`, `src/types`, `src/hooks`, `src/utils`, `src/features` | Upstream, stable: **additive only** |
| `src/plugins/register/**` | Behaviour stable; copy and markup only when the task names them |
| `src/plugins/components/**` | Restyle through tokens only |
| `src/ui`, `src/routes`, `src/theme`, `src/config`, `src/app` | Ours: every rule below, with stricter lint |

- Put code in the most local home: route folder → `src/ui` → shared upstream layer.
- `src/ui` never imports `@/api`, `@/routes`, `@/plugins` or `@/features`; everything arrives as props.
- Routes compose `src/ui` pieces. They never call the request client directly; typed `src/api` modules do that.

## Reuse first
- **Check `src/ui/index.ts` before writing anything.** It has:
  - `PageHeader`, `Toolbar`, `ListPage`, `SectionCard`, `DataTable`;
  - `StatusBadge`, `IconButton`, `FormModal`+`useModalForm`, `ConfirmModal`+`useConfirmFlow`, `DetailDrawer`;
  - `EmptyState`, `MetricTile`, `KeyValueList`, `CodeBlock`;
  - `FilterTabs`, `RouteTabs`, `SearchInput`, `SettingOption`, `HelpPopover`;
  - hooks: `useListState`, `usePendingKeys`, `useRouteTab`, `useConcurrencyQueue`, `useInView`, and more;
  - helpers: `toUserMessage`, `formatDateTime`; style helpers `textStyle`, `focusRingStyle`, `scrollableModal`, `toneColors`.
- **Rule of two.** A second occurrence (more than ~5 lines, or any business rule) is extracted to the narrowest home. A pattern used on two screens becomes a `src/ui` component.
- **A new or moved `src/ui` component** gets a unit test, a `/ui-kit` demo (registered in `routes/ui-kit`) and an `index.ts` export. Styles move verbatim and the old copy is deleted.
- **Use antd directly** (`Button`, `Input`, `Select`, `Form`, `Checkbox`, `Switch`, `Tooltip`, `Alert`); no needless wrappers.
- **Config is data.** Actions, columns, tabs, menus and options are arrays or maps rendered in one loop, not JSX branches.

## Files
```
src/ui/<kebab>/  index.ts (re-exports) · <kebab>.tsx · styled.ts · types.ts · constants.ts · <kebab>.test.tsx
src/routes/<feature>/  <page>.tsx · components/ · columns.tsx · use-<x>.ts · <topic>.ts (pure) · constants.ts · types.ts · styled.ts · __tests__/ (shared fixtures)
```
- Named exports only, and `@/` outside the feature folder.
- Name files `types.ts` (never `.tsx`) and `constants.ts` (plural). Props types are `<Component>Props` in `types.ts`.
- **`constants.ts` is pure:** no React, antd, browser or `@/api` imports. The e2e `tsc` imports `COPY` and can't resolve `@/api` or `import.meta.env`.
- Every new file gets the Apache header (copy it from a neighbouring file). `max-lines` is 250; split along a real seam.

## No loose strings
- **User copy** goes in `COPY` in the feature's `constants.ts`; shared copy in `COMMON_COPY`. Interpolated copy is a function: `help: (label: string) => \`About ${label}\``.
- **Discriminators** (statuses, modes, keys, option ids) are one `as const` object per concept, with the union derived in `types.ts`.
- **Routes** use `PATHS` / `ROUTE_SEGMENTS` (`src/config/paths.ts`); never interpolate `DEVLAKE_PATH_PREFIX`. External URLs go in `src/config/links.ts`, brand strings in `src/config/brand.ts`.
- **Allowed inline:** antd enums, import paths, token CSS in `styled.ts`, `data-*` names and test titles. Tests assert against `COPY`.

## TypeScript and React
- No `any` (use `unknown` and narrow it), and no `!` on API data. Variants are discriminated unions. Optional values are `undefined`; `null` only for refs and API nulls.
- Pure transforms return new objects and never mutate server data. Un-export anything only its own file uses (knip).
- **Data:** `useRefreshData` for route data, `useAutoRefresh` for polling, `operator` for user mutations. **Never** add `useFetch`/`useErrorHandler`-style wrappers.
- **Feedback:**
  - toasts only for user actions;
  - background polling is silent, with no spinner and no layout shift;
  - loading shows on first load only;
  - route errors show `EmptyState` with a retry.
- **Throttling:** focus and visibility refreshes are throttled to at least 10 s.
- **State:** URL for anything that survives a refresh (tab, page, sort, filters). Component state for modals, forms and choices, reset in `afterClose`. Redux only when shared across routes.
- **Hooks:** satisfy `exhaustive-deps`. Use `useMemo`/`useCallback` only where identity or cost matters. Effects clean up.
- **Secrets** (one-time tokens, passwords, keys) stay in component memory: never Redux, URL, storage, logs, errors or test names.

## Styling, accessibility, errors
- **Tokens only:**
  - `theme.space.*`, `theme.colors.*`, `theme.radius.*`, `theme.layout.<name>`, through styled-components or antd `ConfigProvider`;
  - **no** `style={{}}`, no hex/`rgb()`/named colours outside `src/theme`, no magic numbers (a new dimension becomes a `theme.layout` token).
- **Themes and colour:** light and dark both work. Brand purple for primary actions. Red for destructive: outlined in rows, filled only in a confirm. Icons come from `@ant-design/icons` (outline).
- **Accessibility:**
  - everything is keyboard reachable, with a visible focus ring and an accessible name;
  - icon buttons get `aria-label` plus a tooltip from the same `COPY`;
  - status is never colour alone (`StatusBadge` text);
  - modal title is the dialog name;
  - tables get `aria-label`;
  - control groups get `role="group"` + label.
- **Errors:**
  - safe and actionable through `toUserMessage(error, map)`;
  - no stack traces, paths, SQL or `(409)`;
  - a failed submit keeps the values and leaves the modal open;
  - a confirm names its target.
- **Performance:** `lazy()` heavy views. No per-row request waterfalls (at most 3 in flight). Paginate on the server.

## Comments and suppressions
- Comments are one line, only for non-obvious constraints. No narration; rationale goes in the PR.
- **No suppressions:** no `eslint-disable`, `@ts-ignore`/`@ts-expect-error`, or new knip/jscpd ignores.

## Tests
- **Unit (Vitest + Testing Library, no jest-dom):**
  - query by role and `COPY`, and test user-visible behaviour, not antd internals;
  - use `it.each` for case tables, and shared fixtures from the feature's `__tests__/`;
  - mock antd `message` when the subject calls `operator`;
  - timers advance past their delay, leaving nothing pending.
- **Every fix gets a fails-before / passes-after test.** New tests **delete the ones they make redundant**: no overlapping assertions, no duplicate fixtures, no helpers nothing uses. Never weaken an existing assertion.
- **E2E (Playwright):**
  - specs call page-object methods only; locators live in `e2e-tests/support/pages/**`, names come from `support/app-copy.ts`;
  - data is `e2e-` prefixed, created through `support/api.ts` and cleaned up in `afterAll` even on failure;
  - assert every state change through the backend (`support/api.ts`/`db.ts`);
  - a new test needs its golden;
  - no new skips, timeout bumps or looser expects; a flake needs a root cause and `--repeat-each=5`.
- **Iterating:** run e2e against Vite: `corepack yarn start --port 4173`, then `E2E_BASE_URL=http://localhost:4173 corepack yarn exec playwright test <specs>`. Stop the server afterwards.

## Gates (measure at intake; final ≤ intake)
| Command | Must be |
|---|---|
| `lint:check` | 0 errors; warnings ≤ intake |
| `test` | all pass; file and test counts only grow |
| `build` | passes; `grep -r ui-kit dist/` empty |
| `lint:quality` | 0 errors or warnings in files you created or substantively edited (old findings included); per-rule totals don't rise |
| `find:dead-code` | 0 |
| `find:duplicates` | no new clone touching edited files; totals ≤ intake |
| `quality:baseline` | `QUALITY OK` |
| `e2e:census` | OK; no per-spec drop |

- Long output goes to a temp file; read only the summary.
- **Never run** `yarn lint` or `yarn prettier`, which write repo-wide. Use `node_modules/.bin/prettier --check <files>`, and `eslint --fix` only on your own files.
- `quality:baseline --write` and `e2e:census --write` are for the orchestrator only.

## Before you finish
1. Each touched screen keeps all its actions, states and edge cases (no capability cut).
2. Re-read your diff for dead code, duplicated code or tests, unused exports and leftover comments.
3. Upstream layers changed additively only. Note the coupling impact for the PR.
