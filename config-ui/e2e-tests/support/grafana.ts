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
import fs from 'node:fs';
import path from 'node:path';

import { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';

import { GRAFANA_URL, REPO_ROOT } from './env';
import { parseEnvFile } from './env-file';
import { assertE2eEmail, assertLoopbackTarget } from './grafana-safety';

const CREDENTIALS_FILE = path.join(REPO_ROOT, 'auth-secrets.env');
const CREDENTIALS_ERROR = 'Grafana management credentials are unavailable.';
const MANAGEMENT_REQUEST_ERROR = 'Grafana management request failed.';
const LOGIN_REQUEST_ERROR = 'Grafana password check was unavailable.';

interface GrafanaManagementCredentials {
  username: string;
  password: string;
}

interface GrafanaAccountLookup {
  id: number;
  email: string;
}

function parseGrafanaManagementCredentials(
  contents: string,
  inherited: NodeJS.ProcessEnv = process.env,
): GrafanaManagementCredentials {
  const fileValues = parseEnvFile(contents);
  const username = inherited.GRAFANA_MANAGEMENT_USER ?? fileValues.GRAFANA_MANAGEMENT_USER;
  const password = inherited.GRAFANA_MANAGEMENT_PASSWORD ?? fileValues.GRAFANA_MANAGEMENT_PASSWORD;
  if (!username || !password) {
    throw new Error(CREDENTIALS_ERROR);
  }
  return { username, password };
}

function loadManagementCredentials(): GrafanaManagementCredentials {
  try {
    return parseGrafanaManagementCredentials(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
  } catch {
    throw new Error(CREDENTIALS_ERROR);
  }
}

async function withGrafanaRequest<T>(
  playwright: PlaywrightWorkerArgs['playwright'],
  useManagementCredentials: boolean,
  action: (request: APIRequestContext) => Promise<T>,
): Promise<T> {
  assertLoopbackTarget(GRAFANA_URL);
  const credentials = useManagementCredentials ? loadManagementCredentials() : undefined;
  const contextOptions = credentials
    ? {
        baseURL: GRAFANA_URL,
        maxRedirects: 0,
        httpCredentials: {
          username: credentials.username,
          password: credentials.password,
          origin: new URL(GRAFANA_URL).origin,
          send: 'always' as const,
        },
      }
    : { baseURL: GRAFANA_URL, maxRedirects: 0 };

  let request: APIRequestContext;
  try {
    request = await playwright.request.newContext(contextOptions);
  } catch {
    throw new Error(useManagementCredentials ? MANAGEMENT_REQUEST_ERROR : LOGIN_REQUEST_ERROR);
  }
  try {
    return await action(request);
  } catch {
    throw new Error(useManagementCredentials ? MANAGEMENT_REQUEST_ERROR : LOGIN_REQUEST_ERROR);
  } finally {
    try {
      await request.dispose();
    } catch {
      // The safe request result takes precedence over cleanup of its context.
    }
  }
}

function readAccountLookup(value: unknown): GrafanaAccountLookup {
  if (!value || typeof value !== 'object') {
    throw new Error(MANAGEMENT_REQUEST_ERROR);
  }
  const record = value as Record<string, unknown>;
  if (!Number.isSafeInteger(record.id) || Number(record.id) <= 0 || typeof record.email !== 'string') {
    throw new Error(MANAGEMENT_REQUEST_ERROR);
  }
  return {
    id: Number(record.id),
    email: record.email,
  };
}

async function lookupGrafanaAccount(
  request: APIRequestContext,
  email: string,
): Promise<GrafanaAccountLookup | undefined> {
  const lookup = await request.get('/api/users/lookup', {
    params: { loginOrEmail: email },
    maxRedirects: 0,
  });
  if (lookup.status() === 404) {
    return undefined;
  }
  if (!lookup.ok()) {
    throw new Error(MANAGEMENT_REQUEST_ERROR);
  }
  let account: GrafanaAccountLookup;
  try {
    account = readAccountLookup(await lookup.json());
  } catch {
    throw new Error(MANAGEMENT_REQUEST_ERROR);
  }
  if (account.email.toLowerCase() !== email.toLowerCase()) {
    throw new Error(MANAGEMENT_REQUEST_ERROR);
  }
  assertE2eEmail(account.email);
  return account;
}

export async function deleteGrafanaAccountByEmail(
  playwright: PlaywrightWorkerArgs['playwright'],
  email: string,
): Promise<void> {
  assertE2eEmail(email);
  await withGrafanaRequest(playwright, true, async (request) => {
    const account = await lookupGrafanaAccount(request, email);
    if (!account) {
      return;
    }
    const deleted = await request.delete(`/api/admin/users/${account.id}`, { maxRedirects: 0 });
    if (!deleted.ok()) {
      throw new Error(MANAGEMENT_REQUEST_ERROR);
    }
  });
}

export async function setGrafanaAdmin(
  playwright: PlaywrightWorkerArgs['playwright'],
  email: string,
  isGrafanaAdmin: boolean,
): Promise<void> {
  assertE2eEmail(email);
  if (typeof isGrafanaAdmin !== 'boolean') {
    throw new Error(MANAGEMENT_REQUEST_ERROR);
  }
  await withGrafanaRequest(playwright, true, async (request) => {
    const account = await lookupGrafanaAccount(request, email);
    if (!account) {
      if (isGrafanaAdmin) {
        throw new Error(MANAGEMENT_REQUEST_ERROR);
      }
      return;
    }
    const response = await request.put(`/api/admin/users/${account.id}/permissions`, {
      data: { isGrafanaAdmin },
      maxRedirects: 0,
    });
    if (!response.ok()) {
      throw new Error(MANAGEMENT_REQUEST_ERROR);
    }
  });
}

export async function grafanaPasswordLoginWorks(
  playwright: PlaywrightWorkerArgs['playwright'],
  email: string,
  password: string,
): Promise<boolean> {
  assertE2eEmail(email);
  if (!password) {
    throw new Error(LOGIN_REQUEST_ERROR);
  }
  return withGrafanaRequest(playwright, false, async (request) => {
    const response = await request.post('/login', {
      data: { user: email, password },
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    if (response.status() === 200) {
      return true;
    }
    if (response.status() === 401) {
      return false;
    }
    throw new Error(LOGIN_REQUEST_ERROR);
  });
}
