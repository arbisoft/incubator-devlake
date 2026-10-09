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

This brings ornge-frontend's ESLint rules and code-quality scripts into `incubator-devlake/config-ui`.

It isn't pushed as a shared commit because the auto-fixable rules would touch most files and cause merge conflicts on everyone's branches. Apply it on your own branch instead, following the steps below.

**What you get:**

| Command | What it does |
| --- | --- |
| `yarn lint` | Type-check, then ESLint with ornge-frontend's rule set (auto-fixes what it can) |
| `npx eslint . -f ./eslint-summary.cjs` | Read-only lint report: totals per rule, plus `file:line:col` for each issue |
| `yarn find:dead-code` | [Knip](https://knip.dev): unused files, exports and dependencies |
| `yarn find:duplicates` | [jscpd](https://github.com/kucherenko/jscpd): copy-pasted code blocks, with a readable summary |

All steps run inside `config-ui/`.

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

```bash
npx eslint . -f ./eslint-summary.cjs
```
```bash
yarn find:dead-code
```
```bash
yarn find:duplicates
```

Baseline at setup time (2026-10-06), so you can tell whether your numbers look right:

| Check | Result |
| --- | --- |
| ESLint | ~698 errors, 83 warnings. Top rules: `no-explicit-any` (284) and `import/order` (282) |
| ESLint `import/no-unresolved` | **0**. If you see hundreds, step 3 is missing |
| Knip | 14 unused files, 6 unused dependencies, 30 unused exports |
| jscpd | 112 clones, 2,029 duplicated lines (~6.7%) |

## 9. Heads-up before you commit

- **`yarn lint` rewrites files.** It runs `eslint --fix`, so the first run reorders imports and reformats about 140 files. To look without changing anything, use the summary command from step 6.
- **Editor fix-on-save does the same:** with ESLint fix-on-save enabled, every file you open gets rewritten.
- **The pre-commit hook will block commits.** It runs `eslint --fix` on staged files, so any touched file with errors that can't be auto-fixed (e.g. `no-explicit-any`) blocks the commit. Until the backlog is cleaned up, either fix the files you touch or temporarily downgrade the noisy rules to `'warn'` locally.
- **Knip and jscpd exit with an error code** when they find issues. That's expected; don't wire them into CI as blocking until the baseline is cleared.
- **Prettier settings are unchanged** (devlake keeps `printWidth: 120` and Prettier 2). Adopting ornge's Prettier config would reformat the whole codebase.

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
- **Knip needs almost no config.** It infers the Vite entry, the `@/` alias, Vitest, Playwright and the ESLint configs. `knip.jsonc` only ignores the three empty reskin barrels (`src/ui/index.ts`, `src/ui/hooks/index.ts`, `src/routes/ui-kit/index.ts`), each with its reason; do not add ignores to hide real findings.
