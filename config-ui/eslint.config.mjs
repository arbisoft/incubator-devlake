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

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import headers from 'eslint-plugin-headers';
import react from 'eslint-plugin-react';
import globals from 'globals';


const licenseHeader = `Licensed to the Apache Software Foundation (ASF) under one or more
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
`;

// Reskin-owned directories.
const RESKIN_OWNED = ['src/ui/**', 'src/theme/**', 'src/config/**', 'src/routes/**', 'src/app/**'];
const COLOR_LITERAL = String.raw`#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(`;
const COLOR_MESSAGE = 'No colour literals outside src/theme; use theme tokens.';
const E2E_SPEC_CALLS = String.raw`^(locator|getBy\w+|goto|click|fill|waitForURL)$`;
const E2E_SPEC_MESSAGE = 'Specs talk to page objects; move this call into e2e-tests/support/pages.';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      '.yarn',
      'playwright-report',
      'test-results',
      '.jscpd-tmp',
      'eslint.config.mjs',
      '.prettierrc.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
    plugins: {
      headers,
      'react-hooks': reactHooks,
      prettier: prettierPlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-object-type': 'warn',
      'no-empty': 'warn',
      'prettier/prettier': 'warn',
      'headers/header-format': [
        'error',
        {
          source: 'string',
          style: 'jsdoc',
          blockPrefix: '\n',
          content: licenseHeader,
        },
      ],
    },
  },
  {
    // CommonJS tooling scripts (eslint-summary.cjs, format-jscpd.cjs) run under node and keep the licence header.
    files: ['**/*.cjs'],
    plugins: { headers },
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'headers/header-format': [
        'error',
        { source: 'string', style: 'jsdoc', blockPrefix: '\n', content: licenseHeader },
      ],
    },
  },
  {
    // Playwright fixtures take a `use` callback that is not a React hook.
    files: ['e2e-tests/**'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    files: ['e2e-tests/tools/**/*.mjs', 'tools/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: RESKIN_OWNED.map((glob) => `${glob}/*.{ts,tsx,js,jsx}`),
    plugins: { react },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react/forbid-dom-props': ['error', { forbid: ['style'] }],
      'react/forbid-component-props': ['error', { forbid: ['style'] }],
    },
  },
  {
    files: RESKIN_OWNED.filter((glob) => glob !== 'src/theme/**').map((glob) => `${glob}/*.{ts,tsx,js,jsx}`),
    rules: {
      // styled-components CSS lives in TemplateElement nodes, so Literal alone would miss it.
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=/${COLOR_LITERAL}/i]`, message: COLOR_MESSAGE },
        { selector: `TemplateElement[value.raw=/${COLOR_LITERAL}/i]`, message: COLOR_MESSAGE },
      ],
    },
  },
  {
    // Specs use page-object intent methods only (plan 5.2.1); no other no-restricted-syntax config targets e2e specs.
    files: ['e2e-tests/**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `CallExpression[callee.property.name=/${E2E_SPEC_CALLS}/]`, message: E2E_SPEC_MESSAGE },
      ],
    },
  },
  prettierConfig,
);
