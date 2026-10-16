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

// Report-only quality rule set (run with `yarn lint:quality`); not loaded by eslint.config.mjs, so it never gates or rewrites files.
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import sonarjs from 'eslint-plugin-sonarjs';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

import baseConfig from './eslint.config.mjs';

const DEV_DEPENDENCY_FILES = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/__tests__/**',
  'e2e-tests/**',
  'playwright.config.ts',
  'vite.config.ts',
  'vitest.*',
  '*.config.*',
  'tools/**',
  '.prettierrc.js',
];

export default tseslint.config(
  { ignores: ['eslint-summary.cjs', 'format-jscpd.cjs', 'eslint.quality.config.mjs', '.test-dist'] },
  ...baseConfig,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  sonarjs.configs.recommended,
  importX.flatConfigs.typescript,
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
    plugins: { 'import-x': importX },
    settings: {
      react: { version: '19.3' },
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          noWarnOnMultipleProjects: true,
          project: './tsconfig.eslint.json',
        }),
      ],
    },
    rules: {
      'prettier/prettier': 'error',

      'no-console': 'error',
      'no-debugger': 'error',
      'no-alert': 'error',

      'max-lines': ['warn', { max: 250, skipBlankLines: true, skipComments: true }],
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-duplicate-string': ['warn', { threshold: 3 }],
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-identical-expressions': 'error',
      'sonarjs/todo-tag': 'off',

      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always'],
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

      'react/no-array-index-key': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // React Compiler rules (new in react-hooks v7) are advisory until the compiler is adopted.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/globals': 'warn',
      // Style opinions, not defects.
      'sonarjs/no-nested-conditional': 'warn',
      'prefer-destructuring': ['warn', { array: true, object: true }],
      'react/self-closing-comp': 'error',

      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',

      'react/no-is-mounted': 'off',
      'react-hooks/rules-of-hooks': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-unreachable': 'warn',

      'no-duplicate-imports': 'error',
      'import-x/no-unresolved': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-extraneous-dependencies': [
        'error',
        { devDependencies: DEV_DEPENDENCY_FILES, optionalDependencies: false, peerDependencies: false },
      ],

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
  },
  {
    // Playwright fixtures take a `use` callback that is not a React hook.
    files: ['e2e-tests/**'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      // Conditional env guards, not abandoned tests.
      'sonarjs/no-skipped-tests': 'off',
      // Simple URL matchers such as /.*\/access/ are safe.
      'sonarjs/super-linear-regex': 'off',
      // Random ids for test data, not security.
      'sonarjs/pseudo-random': 'off',
      // Fixtures use http:// on purpose.
      'sonarjs/no-clear-text-protocols': 'off',
      // Locator strings repeat by design.
      'sonarjs/no-duplicate-string': 'off',
    },
  },
  {
    files: ['**/*.d.ts'],
    rules: { 'no-var': 'off' },
  },
);
