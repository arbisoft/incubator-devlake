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

import { RESKIN_LINT_PENDING } from './eslint.reskin-pending.mjs';

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

// Reskin-owned directories (plan 3.10); every phase removes the files it cleans from RESKIN_LINT_PENDING.
const RESKIN_OWNED = ['src/ui/**', 'src/theme/**', 'src/config/**', 'src/routes/**', 'src/app/**'];
const COLOR_LITERAL = String.raw`#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(`;
const COLOR_MESSAGE = 'No colour literals outside src/theme; use theme tokens.';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      '.yarn',
      'playwright-report',
      'test-results',
      'eslint.config.mjs',
      '.prettierrc.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
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
    // Playwright fixtures take a `use` callback that is not a React hook.
    files: ['e2e-tests/**'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  {
    files: RESKIN_OWNED.map((glob) => `${glob}/*.{ts,tsx,js,jsx}`),
    ignores: RESKIN_LINT_PENDING,
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
    ignores: RESKIN_LINT_PENDING,
    rules: {
      // styled-components CSS lives in TemplateElement nodes, so Literal alone would miss it.
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=/${COLOR_LITERAL}/i]`, message: COLOR_MESSAGE },
        { selector: `TemplateElement[value.raw=/${COLOR_LITERAL}/i]`, message: COLOR_MESSAGE },
      ],
    },
  },
  prettierConfig,
);
