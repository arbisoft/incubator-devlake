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
# config-ui: ESLint, dead-code and duplicate-check setup

This guide records the ESLint and code-quality tooling ported from ornge-frontend into `incubator-devlake/config-ui`.

**Current status:** the tooling is wired into this branch and adapted for ESLint 10, Yarn 4 and the current Config UI stack. Sections 1–7 below describe the original pre-sync setup; do not replay their dependency or config-file instructions verbatim. The “After the upstream sync” addendum and the current command reference at the end describe what is actually installed and how the reskin uses it.

Run commands from `config-ui/`. The package pins Node 24.19.0 and Yarn 4.17.0.

| Current command | What it does |
| --- | --- |
| `yarn lint:check` | Blocking type and main ESLint check. Checks the app, e2e TypeScript and ESLint without fixing files. |
| `yarn lint:quality` | Read-only report from the additional ESLint quality rules. |
| `yarn find:dead-code` | [Knip](https://knip.dev): reports potentially unused files, exports, types and dependencies. |
| `yarn find:duplicates` | [jscpd](https://github.com/kucherenko/jscpd): prints duplicate-code counts and locations. |
| `yarn quality:baseline` | Runs the quality scans and checks that their repo-wide counts have not grown past `quality.baseline.json`. |

The detailed command meanings, reskin workflow and safe baseline-update rules are in the current command reference at the end of this guide.

---

## 1. Dependencies

Remove the old React-app preset (it bundles older plugin versions that conflict with the new ones):

```bash
yarn remove eslint-config-react-app
```

Add the new tooling as **dev** dependencies:

```bash
yarn add -D knip@^6.39.0 jscpd@^5.4.0 @typescript-eslint/eslint-plugin@^7.13.1 @typescript-eslint/parser@^7.13.1 eslint-plugin-react@^7.37.0 eslint-plugin-react-hooks@^4.6.2 eslint-plugin-jsx-a11y@^6.10.2 eslint-plugin-import@^2.32.0 eslint-plugin-sonarjs@^4.0.2 eslint-import-resolver-typescript@^4.4.4 eslint-config-prettier@^9.1.0
```

> `knip` and `jscpd` must go in `devDependencies`, not `dependencies`. Don't install `sonar-js`: it's an unrelated package. The ESLint plugin is `eslint-plugin-sonarjs`.

## 2. `package.json` scripts

Add these to `"scripts"`:

```json
"find:dead-code": "knip",
"jscpd:run": "jscpd ./src --pattern \"**/*.{js,jsx,ts,tsx}\" --min-lines 5 --min-tokens 50",
"jscpd:format": "node format-jscpd.js",
"find:duplicates": "npm run jscpd:format"
```

> Note: `jscpd:run` scans `./src`. ornge-frontend uses `./app`, which doesn't exist in config-ui.

## 3. `tsconfig.eslint.json` (new file)

The ESLint import resolver can't resolve the `@/` alias through the `references` entry in `tsconfig.json`; without this file you get ~490 false `import/no-unresolved` errors. `references` isn't inherited through `extends`, so this file fixes it:

```json
{
  "extends": "./tsconfig.json",
  "include": ["src"]
}
```

## 4. `.eslintrc.js` (replace the whole file)

Ported from ornge-frontend, with these changes for a Vite app:

- **Next.js preset:** `next/core-web-vitals` is replaced with `plugin:react/recommended` and `plugin:react/jsx-runtime`.
- **Storybook preset:** `plugin:storybook/recommended` is dropped, since config-ui doesn't use Storybook.
- **License header:** devlake's `header/header` rule is kept, because Apache requires the header.
- **ornge-only exceptions:** the bans on `cross-fetch` and `numeric` and the file-specific overrides are dropped, since those files don't exist here.

```js
/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

// Rule set ported from ornge-frontend. Next.js/Storybook presets are replaced with
// their plain React equivalents since config-ui is a Vite app.
module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'plugin:sonarjs/recommended-legacy',
    'plugin:import/typescript',
  ],
  plugins: ['@typescript-eslint', 'jsx-a11y', 'sonarjs', 'import', 'header'],
  rules: {
    /* --- DEVLAKE --- */
    'header/header': ['error', '.file-headerrc'],

    /* --- PRODUCTION SAFEGUARDS --- */
    'no-console': 'error',
    'no-debugger': 'error',
    'no-alert': 'error',

    /* --- ARCHITECTURE & COMPLEXITY --- */
    'max-lines': ['warn', { max: 250, skipBlankLines: true, skipComments: true }],
    'sonarjs/cognitive-complexity': ['error', 15],
    'sonarjs/no-duplicate-string': ['warn', { threshold: 3 }],
    'sonarjs/no-identical-functions': 'error',
    'sonarjs/no-identical-conditions': 'error',
    'sonarjs/no-identical-expressions': 'error',
    'sonarjs/todo-tag': 'off',

    /* --- STRICT TYPING & STYLE --- */
    '@typescript-eslint/no-explicit-any': 'error',
    eqeqeq: ['error', 'always'],
    'prefer-destructuring': ['error', { array: true, object: true }],
    '@typescript-eslint/ban-ts-comment': [
      'error',
      {
        'ts-expect-error': 'allow-with-description',
        'ts-ignore': true,
        'ts-nocheck': true,
        'ts-check': false,
        minimumDescriptionLength: 10,
      },
    ],

    /* --- REACT BEST PRACTICES --- */
    'react/no-array-index-key': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react/self-closing-comp': 'error',

    /* --- ACCESSIBILITY --- */
    'jsx-a11y/alt-text': 'error',
    'jsx-a11y/role-has-required-aria-props': 'error',

    /* --- EXISTING PROJECT RULES --- */
    'react/no-is-mounted': 'off',
    'react-hooks/rules-of-hooks': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'prettier/prettier': 'error',
    'no-unreachable': 'warn',

    /* --- IMPORT & DEPENDENCY STRATEGY --- */
    'no-duplicate-imports': 'error',
    'import/no-unresolved': 'error',
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    // Ensures devDependencies (like Knip) aren't imported into production code
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: [
          '**/*.test.ts',
          '**/*.test.tsx',
          '**/*.spec.ts',
          '**/*.spec.tsx',
          '**/vite.config.ts',
          '.eslintrc.js',
          '.prettierrc.js',
        ],
        optionalDependencies: false,
        peerDependencies: false,
      },
    ],

    /* --- RESTRICTED IMPORTS --- */
    'no-restricted-imports': [
      'warn',
      {
        patterns: [
          {
            group: ['../../../*', '../../../../*'],
            message: 'Use absolute imports (e.g., @/) instead of deep relative paths.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.d.ts'],
      rules: { 'no-var': 'off' },
    },
    {
      files: ['*.js', '*.cjs'],
      rules: { '@typescript-eslint/no-var-requires': 'off' },
    },
  ],
  settings: {
    react: { version: 'detect' },
    'import/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx'] },
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: './tsconfig.eslint.json',
      },
      node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
    },
  },
};
```

## 5. `.eslintignore`

Append:

```
.test-dist
eslint-summary.cjs
format-jscpd.js
```

## 6. `eslint-summary.cjs` (new file)

A custom ESLint formatter that prints totals per rule, followed by every `file:line:col` grouped by rule. It's report-only and never changes files:

```bash
npx eslint . -f ./eslint-summary.cjs
```

```js
const path = require('path');

module.exports = function (results) {
  const summary = {};
  let totalErrors = 0;
  let totalWarnings = 0;

  // 1. Process results and store exact line/column locations
  results.forEach((result) => {
    const relativePath = path.relative(process.cwd(), result.filePath);

    result.messages.forEach((msg) => {
      const rule = msg.ruleId || 'unknown-rule';

      if (!summary[rule]) {
        summary[rule] = { errors: 0, warnings: 0, locations: [] };
      }

      const isError = msg.severity === 2;
      
      if (isError) {
        summary[rule].errors++;
        totalErrors++;
      } else {
        summary[rule].warnings++;
        totalWarnings++;
      }

      // Store the exact location and type for each violation
      summary[rule].locations.push({
        file: relativePath,
        line: msg.line || 0,
        column: msg.column || 0,
        type: isError ? 'Error' : 'Warning',
      });
    });
  });

  // Sort rules by total issues (Errors prioritized)
  const sortedRules = Object.keys(summary).sort((a, b) => {
    const aTotal = summary[a].errors * 1000 + summary[a].warnings;
    const bTotal = summary[b].errors * 1000 + summary[b].warnings;
    return bTotal - aTotal;
  });

  // 2. Build the Summary Table
  let output = '\n================ ESLINT SUMMARY ================\n';
  output += 'Rule'.padEnd(45) + ' | Errors | Warnings\n';
  output += '-----------------------------------------------------------------\n';

  sortedRules.forEach((rule) => {
    output += `${rule.padEnd(45)} | ${summary[rule].errors.toString().padEnd(6)} | ${summary[rule].warnings}\n`;
  });

  output += '-----------------------------------------------------------------\n';
  output += `TOTALS`.padEnd(45) + ` | ${totalErrors.toString().padEnd(6)} | ${totalWarnings}\n\n`;

  // 3. Build the Clickable File Navigation
  output += '================ WHERE TO FIX THEM ================\n';

  sortedRules.forEach((rule) => {
    output += `\n🛑 ${rule} (${summary[rule].errors} errors, ${summary[rule].warnings} warnings)\n`;

    // Sort locations alphabetically by file, then by line number
    const sortedLocations = summary[rule].locations.sort((a, b) => {
      if (a.file === b.file) return a.line - b.line;
      return a.file.localeCompare(b.file);
    });

    sortedLocations.forEach((loc) => {
      // Formats as: └─ [Error] src/file.tsx:15:25
      const colorType = loc.type === 'Error' ? 'Error  ' : 'Warning';
      output += `   └─ [${colorType}] ${loc.file}:${loc.line}:${loc.column}\n`;
    });
  });

  output += '\n';
  return output;
};

// yarn eslint . -f ./eslint-summary.cjs
```

## 7. `format-jscpd.js` (new file)

Runs jscpd, then prints a summary table and the duplicated blocks grouped by file.

> **Don't copy this file from ornge-frontend unchanged.** ornge uses jscpd v4. jscpd v5 moved each format's stats from `formats[x].total` to `formats[x]`, so the old script crashes with `Cannot read properties of undefined (reading 'duplicatedLines')`. The version below handles both.

```js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const tempDir = path.join(__dirname, '.jscpd-tmp');
const reportPath = path.join(tempDir, 'jscpd-report.json');

console.log('🔍 Scanning for duplicates...');

try {
  // Executes your pure jscpd:run command, but invisibly appends the flags
  // needed to generate a temporary JSON file so we can format it.
  execSync('npm run jscpd:run --silent -- --reporters json --output ./.jscpd-tmp', {
    stdio: 'ignore',
  });
} catch (error) {
  // jscpd intentionally throws an error code when duplicates are found.
  // We catch it here so the script can keep running!
}

// If no JSON file was created, there are no duplicates.
if (!fs.existsSync(reportPath)) {
  console.log('\n✅ No duplicates found! Great job.\n');
  process.exit(0);
}

// Parse the generated JSON
const data = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
const stats = data.statistics?.formats || {};
const totals = data.statistics?.total || {};

console.log('\n================ JSCPD SUMMARY ================');
console.log('Format       | Duplicated Lines | Clones | Files Analyzed');
console.log('---------------------------------------------------------');

['typescript', 'javascript', 'tsx'].forEach((format) => {
  if (stats[format]) {
    // jscpd v4 nests per-format stats under `total`; v5 puts them on the format itself
    const formatTotals = stats[format].total || stats[format];
    const lines = String(formatTotals.duplicatedLines).padEnd(16);
    const clones = String(formatTotals.clones).padEnd(6);
    const files = formatTotals.sources;
    console.log(`${format.padEnd(12)} | ${lines} | ${clones} | ${files}`);
  }
});

console.log('---------------------------------------------------------');
console.log(
  `TOTALS       | ${String(totals.duplicatedLines || 0).padEnd(16)} | ${String(totals.clones || 0).padEnd(6)} | ${totals.sources || 0}`,
);

console.log('\n================ WHERE TO FIX THEM ================');

const duplicatesByFile = {};

if (data.duplicates && data.duplicates.length > 0) {
  data.duplicates.forEach((dup) => {
    const file1 = dup.firstFile.name;
    const file2 = dup.secondFile.name;

    if (!duplicatesByFile[file1]) duplicatesByFile[file1] = [];

    // Grab a short preview of the duplicated code
    let preview = dup.fragment
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l)
      .join(' ');
    if (preview.length > 80) preview = preview.substring(0, 80) + '...';

    duplicatesByFile[file1].push({
      lines: dup.lines,
      range1: `${dup.firstFile.start}-${dup.firstFile.end}`,
      file2: file2,
      range2: `${dup.secondFile.start}-${dup.secondFile.end}`,
      preview: preview,
    });
  });

  Object.entries(duplicatesByFile)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([file, dups]) => {
      console.log(`\n🛑 ${file} (${dups.length} clones)`);

      dups.forEach((d) => {
        // Output format: source_file:xx-yy <---> target_file:xx-yy
        console.log(`   └─ ${file}:${d.range1} <---> ${d.file2}:${d.range2}`);
        console.log(`      Snippet: "${d.preview}"\n`);
      });
    });
} else {
  console.log('\n✅ No duplicates found! Great job.');
}
console.log('\n');

// Clean up the temporary folder so your workspace stays spotless
fs.rmSync(tempDir, { recursive: true, force: true });
```

> jscpd v5 prints paths relative to `src/`. For example, `plugins/register/...` is `src/plugins/register/...`.

---

## 8. Verify

The original commands in this section were written before the upstream sync. For the current ESLint 10 setup, use the command reference at the end of this guide; the checked-in quality baseline was established after phase 0 cleanup.

```bash
yarn lint:check
yarn lint:quality
yarn find:dead-code
yarn find:duplicates
yarn quality:baseline
```

Phase 0 quality baseline after cleanup (2026-10-06):

| Check | Result |
| --- | --- |
| `lint:quality` | 428 errors, 250 warnings across the repo |
| Knip | 0 findings |
| jscpd | 119 clones, 2,083 duplicated lines |

## 9. Heads-up before you commit

- **`yarn lint` and `yarn lint:fix` modify files.** They run ESLint with `--fix`; inspect the diff after using them. `yarn lint:check`, `yarn lint:quality`, `yarn find:dead-code`, `yarn find:duplicates` and the normal `yarn quality:baseline` run do not auto-fix files.
- **The quality baseline is not a zero-debt claim.** Phase 0 records the existing repo-wide backlog. During the reskin, each substantively edited file must end with zero quality-lint errors, while whole-repo counts must not grow. The phase report records reviewed false positives and the baseline delta.
- **`yarn quality:baseline --write` changes `quality.baseline.json`.** It records the current counts; run it only after triage, when counts have fallen or an explained addition has been approved and documented. It is not a way to make an unexplained regression pass.
- **Prettier is version 3.** Use `corepack yarn exec prettier --check <files>` to check formatting. `yarn prettier` rewrites the whole tree.

---

## After the upstream sync (#83)

The steps above were written for the pre-sync stack. This branch is now on ESLint 10 flat config, so several steps no longer work as written. Each change below says what happened, what it breaks in the steps above, and the workaround that is implemented in this repo.

- **Flat config replaced `.eslintrc.js` and `.eslintignore`.** After the sync, ESLint 10 only reads `eslint.config.mjs`, so step 4 (`.eslintrc.js`) and step 5 (`.eslintignore`) no longer apply. The main config is `eslint.config.mjs` and its `ignores` array. The guide's rules live in a separate `eslint.quality.config.mjs`, which spreads the main config and adds the presets and rules on top, so ignores and parser settings are not duplicated.
- **The quality config is report-only.** `yarn lint` and the husky hook run `eslint --fix` with the main config, so putting the guide's rules there would fail commits and rewrite about 140 files (step 9). Nothing loads `eslint.quality.config.mjs` except `yarn lint:quality` (`eslint -c eslint.quality.config.mjs . -f ./eslint-summary.cjs`), so `lint:check`, `yarn lint` and the hook behave as before. To adopt the rules later, merge the config into `eslint.config.mjs`.
- **`eslint-plugin-import` does not support ESLint 10.** Step 1 and the step 4 rules (`import/order`, `import/no-unresolved`, `import/no-extraneous-dependencies`, `plugin:import/typescript`) cannot be installed or loaded. We use `eslint-plugin-import-x`, its flat-config fork, so the rules are named `import-x/*`. The TypeScript resolver is `eslint-import-resolver-typescript` through `import-x/resolver-next` in `eslint.quality.config.mjs`.
- **`settings.react.version: 'detect'` crashes `eslint-plugin-react` 7.37 on ESLint 10** (`getFilename is not a function`), so the step 4 `settings` block cannot be used. The version is pinned in `eslint.quality.config.mjs` (`react: { version: '19.3' }`). Bump it when React is bumped.
- **`eslint-plugin-headers` replaced `.file-headerrc`.** Step 4's `header/header` rule and `.file-headerrc` do not exist after the sync. The licence header is enforced by `headers/header-format` in `eslint.config.mjs`, which the quality config inherits. `eslint.config.mjs` also applies it to the `.cjs` scripts.
- **Package versions differ from step 1.** `@typescript-eslint/*` 7 is replaced by `typescript-eslint` 8, `eslint-plugin-react-hooks` 4 by 7 and `eslint-config-prettier` 9 by 10, all already in `package.json`. Do not install step 1's versions. `eslint-plugin-react-hooks` 7 `recommended` also includes the React Compiler rules (`set-state-in-effect`, `refs`, `immutability`, `globals` and others), which the guide's 4.x did not have. `eslint.quality.config.mjs` sets the ones that fire to `warn`.
- **Prettier is 3, not 2.** Step 9 says Prettier 2. The repo config (`.prettierrc.js`, `printWidth: 120`) is unchanged and the quality config keeps `prettier/prettier`. Check files with `corepack yarn exec prettier --check <files>`; do not run `yarn prettier`, which rewrites the repo.
- **Formatters are `.cjs` and scripts use Yarn.** Steps 2, 6 and 7 name `format-jscpd.js` and call `npm run`. The scripts are `eslint-summary.cjs` and `format-jscpd.cjs`, and `format-jscpd.cjs` calls `corepack yarn jscpd:run`. They carry the licence header and are linted by the main config.
- **`tsconfig.eslint.json` is still needed.** Step 3 holds on this branch: without it `import-x/no-unresolved` cannot resolve the `@/` alias through the `references` entry in `tsconfig.json`. The file is in this repo and is passed as the resolver `project`.
- **Scripts as they exist.** Run these from `config-ui/`; none rewrites files, and the old `dup` script is gone (superseded by `find:duplicates`).
  - `yarn lint:quality`: the quality ESLint report.
  - `yarn find:dead-code`: `knip`.
  - `yarn jscpd:run`: raw jscpd on `./src`.
  - `yarn jscpd:format`: `node format-jscpd.cjs`.
  - `yarn find:duplicates`: runs `jscpd:format`.
  - `yarn quality:baseline`: see below.
- **`quality:baseline` stops the counts growing.** The report-only tools have no gate of their own. `tools/quality-baseline.mjs` runs the quality ESLint config, knip and jscpd, and compares per-rule ESLint totals, the knip findings and the jscpd totals with `quality.baseline.json`. It exits 1 if any of them grows. `yarn quality:baseline --write` rewrites the baseline, and should only be used when counts went down or an addition is explained.
- **Rule tuning.** Some guide rules are noisy for this repo, so `eslint.quality.config.mjs` changes them, each with a one-line reason in the file. For `e2e-tests/**` it turns off `sonarjs/no-skipped-tests`, `super-linear-regex`, `pseudo-random`, `no-clear-text-protocols` and `no-duplicate-string`. Repo-wide it sets `sonarjs/no-nested-conditional`, `prefer-destructuring` and the React Compiler hook rules to `warn`. Everything else stays at the guide's severity.
- **Knip needs almost no config.** It infers the Vite entry, the `@/` alias, Vitest, Playwright and the ESLint configs. `knip.jsonc` has no ignores now that the reskin barrels are filled; do not add ignores to hide real findings.

## Current command reference: ESLint 10+ and the Config UI reskin

Run these from `config-ui/`. The added quality-tool scripts are `lint:quality`, `find:dead-code`, `jscpd:run`, `jscpd:format`, `find:duplicates` and `quality:baseline`. `lint:check` is the blocking check; phase 0 extended it to type-check the e2e suite too. The e2e census and goldens are separate regression tools, not lint commands.

The tools answer different questions: `lint:check` checks the blocking type/lint contract; the quality scans track stronger rules and the existing backlog; the e2e census and goldens prove that the UI rebuild preserved behavior.

| Command | What it checks or reports | How the reskin uses the result | Changes repo files? |
| --- | --- | --- | --- |
| `yarn lint:check` | TypeScript for the app, TypeScript for `e2e-tests/`, then the main ESLint config. This is the normal blocking lint check and must have zero errors. | Run for each phase. It catches type errors in page objects/spec support as well as app code. It does not replace `lint:quality`. | No |
| `yarn lint:quality` | ESLint 10 flat config plus the additional React, hooks, accessibility, SonarJS and import-x quality rules. `eslint-summary.cjs` groups findings by rule and prints each location. | Fix genuine errors in every file substantively edited by the phase. Compare repo-wide per-rule counts with `quality.baseline.json`; triage false positives in the phase report. | No |
| `yarn find:dead-code` | Knip reports unused files, exports, types and dependencies. | After moving screens into the reskin structure or extracting shared components, inspect whether old files/exports/dependencies are now orphaned. Remove genuine dead code and explain retained findings; do not suppress findings just to quiet Knip. | No |
| `yarn jscpd:run` | Raw jscpd scan of `src/`, using a minimum of 5 lines and 50 tokens for a clone. | Use when you need the underlying duplication scan or are debugging the formatted report. | No |
| `yarn jscpd:format` | Runs the raw scan and prints a readable summary with clone counts, duplicated lines and file/line pairs. | Use the locations to review repeated reskin patterns. When the same UI pattern is genuinely shared, extract it into `src/ui/`; not every textual clone is a reusable component. | No |
| `yarn find:duplicates` | The convenient alias for the readable jscpd report above. | Report the clone/duplicated-line delta for the phase and leave no new clone in reskin-owned code; retain a clone only with a reason. | No |
| `yarn quality:baseline` | Runs quality ESLint, Knip and jscpd, then compares per-rule error/warning totals, Knip findings, clone count and duplicated-line count with `quality.baseline.json`. Prints `QUALITY OK` if none grew; otherwise lists each increase and exits nonzero. | Run after phase fixes. It is the repo-wide “no new quality debt” gate; also inspect `lint:quality` by touched file because this aggregate does not prove touched files have zero errors. | No |
| `yarn quality:baseline --write` | Writes the current quality scan results to `quality.baseline.json`. | Use only at the end of a reviewed phase after fixing/triaging findings. The reskin plan expects the baseline to move down; any accepted increase needs an explicit reason in the phase report. | **Yes:** rewrites the baseline JSON |

### How the commands fit into a reskin phase

1. Run `yarn lint:check` to establish that the app and e2e code type-check and pass the main ESLint config.
2. Run `yarn lint:quality` and review its output for the files the phase is changing. Fix genuine errors in those files; record any reviewed false positives with a reason.
3. Run `yarn find:dead-code` after component/page moves, then remove genuine orphaned code or dependencies.
4. Run `yarn find:duplicates` after building shared UI. Review the locations and extract repeated patterns used in multiple screens into `src/ui/` where appropriate. The report is a signal for review, not an instruction to deduplicate blindly.
5. Run `yarn quality:baseline`. The repo-wide ESLint, Knip and jscpd counts must not grow. Update the baseline only after the phase has been reviewed and its findings are resolved or explained.
6. Complete the separate regression gates: unit tests, build, e2e in the required auth states, `yarn e2e:census`, and golden request comparison. Lint/quality scans do not prove that user flows or API requests still work.

The intent is **incremental cleanup**, not a bulk rewrite before the reskin. The existing ESLint quality backlog can remain in untouched legacy files. Each phase pays down findings in the files it substantively changes, while the aggregate baseline prevents new debt elsewhere.

### Related commands that are not part of the added quality scans

- `yarn lint` runs TypeScript and then ESLint with `--fix`; `yarn lint:fix` runs only ESLint `--fix`. Both can rewrite files, so inspect their diffs.
- `yarn e2e:census` is the reskin's static test/assertion-count guard, not a lint command. It detects removed assertions, tests, or newly skipped/fixme tests against the phase 0 baseline.
- `yarn test:e2e` runs Playwright. The golden comparison checks that reskinned flows still send the same normalized write requests. These validate behavior; the lint scans validate code quality and duplication.
