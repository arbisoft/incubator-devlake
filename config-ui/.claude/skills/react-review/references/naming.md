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

# Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Exported constants | `SCREAMING_SNAKE_CASE` | `export const API_ROUTES`, `MAX_RETRIES` |
| Local constants and variables | `camelCase` | `const pageSize = 20` |
| Enum-like value map keys | `SCREAMING_SNAKE_CASE` | `USER_STATUS.ACTIVE` |
| Config object keys | `camelCase` | `TABLE_CONFIG.pageSize` |
| Components | `PascalCase` | `UserForm` |
| Hooks | `useXxx`, file `use-xxx.ts` | `useUserForm` |
| Functions | `camelCase`, verb first | `getUser`, `formatDate`, `buildQuery` |
| Service functions | verb + entity | `fetchUsers`, `updateUser`, `deleteRole` |
| Booleans | `is`/`has`/`should`/`can` prefix | `isOpen`, `hasError`, `canEdit` |
| Event props | `onXxx` | `onSubmit`, `onRowClick` |
| Handler implementations | `handleXxx` | `handleSubmit` |
| Types / interfaces | `PascalCase`, no `I` prefix | `User`, `UserFormProps` |
| Context / provider / hook | `XxxContext`, `XxxProvider`, `useXxx` | `ToastContext`, `ToastProvider`, `useToast` |
| Folders and files | lowercase `kebab-case` | `user-form/`, `use-user-form.ts` |
| Component file | `<component-folder>/index.tsx` | `user-form/index.tsx` |
| Concern folders | `<concern>/index.ts` | `constants/index.ts`, `service/index.ts` |
| Tests | `*.test.ts(x)` next to the source | `use-user-form.test.ts` |

The `SCREAMING_SNAKE_CASE` rule is for exported **constants** only — exported components stay PascalCase and exported functions/hooks stay camelCase.

Also flag:
- Generic names outside tiny scopes: `data`, `item`, `obj`, `temp`, `info`, `res`, `handle`, `doStuff`.
- Abbreviations that aren't universal (`usr`, `cfg`, `btnTxt`).
- Names that lie: `getX` that mutates or fetches, `isX` that isn't boolean, a hook that isn't a hook (no hooks inside) named `useX`.
- Folder and file names with uppercase or underscores.
- The same concept named differently across modules (`account` vs `user` vs `member`) — pick one per domain.

Naming is mostly mechanical. If the violations are widespread and there's no lint rule, recommend `@typescript-eslint/naming-convention` and a filename rule (`eslint-plugin-check-file`) once instead of listing every instance.
