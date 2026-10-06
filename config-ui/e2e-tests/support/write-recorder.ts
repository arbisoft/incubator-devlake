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
import { BrowserContext, Request, TestInfo, test as base, expect } from '@playwright/test';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

import {
  GOLDEN_IGNORED_WRITES,
  GOLDEN_MASK,
  GOLDEN_MASKED_KEYS,
  GOLDEN_UNORDERED_BY_KEY,
  TEST_ACTION_HEADER,
} from './constants';
import { API_URL, APP_URL } from './env';

export interface RecordedWrite {
  method: string;
  path: string;
  body: unknown;
}

export interface Golden {
  titlePath: string[];
  writes: RecordedWrite[];
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MASKED_KEYS = new Set(GOLDEN_MASKED_KEYS.map((key) => key.toLowerCase()));
const APP_ORIGIN = new URL(APP_URL).origin;
const API_ORIGIN = new URL(API_URL).origin;
const GOLDENS_DIR = path.resolve(__dirname, '../goldens');

// uniqueName() ends in 12 base36 chars, e2e_ logins in a ms timestamp, and ad-hoc names in 6+ digits.
const E2E_NAME = /(?<![A-Za-z0-9])e2e-(?:[a-z0-9]+-)*(?:[a-z0-9]{12}|\d{6,})(?![A-Za-z0-9])/g;
const E2E_LOGIN = /(?<![A-Za-z0-9])e2e_(?:[a-z0-9]+_)*\d{10,}(?![A-Za-z0-9])/g;

const normaliseString = (value: string): string => value.replace(E2E_NAME, 'e2e-*').replace(E2E_LOGIN, 'e2e_*');

const isKeyedObject = (item: unknown): item is Record<string, unknown> =>
  item !== null &&
  typeof item === 'object' &&
  typeof (item as Record<string, unknown>)[GOLDEN_UNORDERED_BY_KEY] === 'string';

function sortUnordered(items: unknown[]): unknown[] {
  if (items.length === 0 || !items.every(isKeyedObject)) {
    return items;
  }
  const sortKey = (item: Record<string, unknown>): string =>
    `${String(item[GOLDEN_UNORDERED_BY_KEY])}|${JSON.stringify(item)}`;
  return [...items].sort((a, b) => {
    const [keyA, keyB] = [sortKey(a as Record<string, unknown>), sortKey(b as Record<string, unknown>)];
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });
}

function normaliseValue(value: unknown, key?: string): unknown {
  if (key !== undefined && MASKED_KEYS.has(key.toLowerCase())) {
    return GOLDEN_MASK;
  }
  if (typeof value === 'string') {
    return normaliseString(value);
  }
  if (Array.isArray(value)) {
    return sortUnordered(value.map((item) => normaliseValue(item)));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, normaliseValue(v, k)]),
    );
  }
  return value;
}

function normalisePath(url: URL): { pathname: string; withQuery: string } {
  const pathname = url.pathname
    .split('/')
    .map((segment) => (/^\d+$/.test(segment) ? ':id' : normaliseString(decodeURIComponent(segment))))
    .join('/');
  const query = [...url.searchParams.entries()].map(([k, v]) => `${k}=${normaliseValue(v, k)}`).join('&');
  return { pathname, withQuery: query ? `${pathname}?${query}` : pathname };
}

function normaliseBody(raw: string | null): unknown {
  if (raw === null || raw === '') {
    return null;
  }
  try {
    return normaliseValue(JSON.parse(raw));
  } catch {
    return normaliseString(raw);
  }
}

// Browser requests to the app's /api/** (and to the backend origin, if the UI ever calls it directly).
const isDevlakeApi = (url: URL): boolean =>
  (url.origin === APP_ORIGIN && url.pathname.startsWith('/api/')) || url.origin === API_ORIGIN;

function toRecordedWrite(request: Request): RecordedWrite | undefined {
  const method = request.method();
  if (!WRITE_METHODS.has(method)) {
    return undefined;
  }
  const url = new URL(request.url());
  if (!isDevlakeApi(url)) {
    return undefined;
  }
  if (request.headers()[TEST_ACTION_HEADER] !== undefined) {
    return undefined;
  }
  const { pathname, withQuery } = normalisePath(url);
  if (GOLDEN_IGNORED_WRITES.some((ignored) => ignored.method === method && ignored.path.test(pathname))) {
    return undefined;
  }
  return { method, path: withQuery, body: normaliseBody(request.postData()) };
}

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export function goldenPath(testInfo: TestInfo): string {
  const specPath = path.relative(testInfo.project.testDir, testInfo.file).replace(/\.spec\.ts$/, '');
  const titlePath = testInfo.titlePath.slice(1);
  const hash = createHash('sha1').update(titlePath.join('\u0000')).digest('hex').slice(0, 8);
  return path.join(GOLDENS_DIR, specPath, `${slugify(titlePath[titlePath.length - 1])}--${hash}.json`);
}

function checkGolden(actual: Golden, file: string): void {
  if (process.env.E2E_UPDATE_GOLDENS === '1') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`);
    return;
  }
  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing write golden ${path.relative(GOLDENS_DIR, file)}; run with E2E_UPDATE_GOLDENS=1 to create it.`,
    );
  }
  const expected = JSON.parse(fs.readFileSync(file, 'utf-8')) as Golden;
  expect(actual, `UI writes differ from golden ${path.relative(GOLDENS_DIR, file)}`).toEqual(expected);
}

// Records every UI write to the DevLake API, in every browser context the test creates, and compares or writes the golden.
export const test = base.extend<{ writeRecorder: void }>({
  writeRecorder: [
    async ({ browser }, use, testInfo) => {
      const writes: RecordedWrite[] = [];
      const attached = new WeakSet<BrowserContext>();
      const onRequest = (request: Request) => {
        const write = toRecordedWrite(request);
        if (write) {
          writes.push(write);
        }
      };
      const attach = (context: BrowserContext) => {
        if (!attached.has(context)) {
          attached.add(context);
          context.on('request', onRequest);
        }
      };

      // Every context, including Playwright's own default one, is created through browser.newContext (newPage calls it too).
      const originalNewContext = browser.newContext.bind(browser);
      browser.newContext = async (options) => {
        const context = await originalNewContext(options);
        attach(context);
        return context;
      };

      await use();

      delete (browser as { newContext?: unknown }).newContext;
      if (testInfo.status === 'skipped' || testInfo.status !== testInfo.expectedStatus) {
        return;
      }
      const missed = browser.contexts().filter((context) => !attached.has(context));
      if (missed.length > 0) {
        throw new Error(
          `Write recorder missed ${missed.length} browser context(s) created outside browser.newContext.`,
        );
      }
      checkGolden({ titlePath: testInfo.titlePath.slice(1), writes }, goldenPath(testInfo));
    },
    { auto: true },
  ],
});
