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
import type { APIRequestContext, APIResponse, PlaywrightWorkerArgs } from '@playwright/test';

import type {
  GrafanaCreateUserBody,
  GrafanaOrphan,
  GrafanaUser,
  GrafanaUserList,
  GrafanaUserListParams,
} from '../../src/api/grafana-users/types';

import { API_URL } from './env';
import { deleteGrafanaAccountByEmail } from './grafana';
import { assertE2eEmail, assertE2eProjectName, assertLoopbackTarget } from './grafana-safety';

const GRAFANA_ROUTE = '/access/grafana';
const GRAFANA_E2E_QUERY = 'e2e-';
const GRAFANA_PAGE_SIZE = 100;
const OWNERSHIP_ERROR = 'Refusing to mutate a Grafana account outside the e2e test registry.';

function apiTarget(path: string): string {
  const target = new URL(path, `${API_URL}/`).toString();
  assertLoopbackTarget(target);
  return target;
}

function readRecord(value: unknown, error: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error(error);
  }
  return value as Record<string, unknown>;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function readGrafanaUser(value: unknown): NumericGrafanaUser {
  const error = 'Grafana user response was invalid.';
  const user = readRecord(value, error);
  if (
    !Number.isSafeInteger(user.id) ||
    Number(user.id) < 1 ||
    typeof user.email !== 'string' ||
    typeof user.name !== 'string' ||
    typeof user.role !== 'string' ||
    typeof user.disabled !== 'boolean' ||
    typeof user.sso !== 'boolean' ||
    typeof user.protected !== 'boolean' ||
    !isStringList(user.projects) ||
    (user.lastSeenAt !== undefined && typeof user.lastSeenAt !== 'string')
  ) {
    throw new Error(error);
  }
  return value as NumericGrafanaUser;
}

function readGrafanaOrphan(value: unknown): GrafanaOrphan {
  const error = 'Grafana orphan response was invalid.';
  const orphan = readRecord(value, error);
  if (typeof orphan.account !== 'string' || !isStringList(orphan.projects)) {
    throw new Error(error);
  }
  return value as GrafanaOrphan;
}

function readGrafanaUserList(value: unknown): NumericGrafanaUserList {
  const error = 'Grafana user list response was invalid.';
  const result = readRecord(value, error);
  if (
    typeof result.count !== 'number' ||
    !Number.isSafeInteger(result.count) ||
    result.count < 0 ||
    typeof result.page !== 'number' ||
    !Number.isSafeInteger(result.page) ||
    result.page < 1 ||
    typeof result.pageSize !== 'number' ||
    !Number.isSafeInteger(result.pageSize) ||
    result.pageSize < 1 ||
    result.pageSize > GRAFANA_PAGE_SIZE ||
    !Array.isArray(result.users) ||
    !Array.isArray(result.orphans)
  ) {
    throw new Error(error);
  }
  const users = result.users.map(readGrafanaUser);
  const orphans = result.orphans.map(readGrafanaOrphan);
  return { users, count: result.count, page: result.page, pageSize: result.pageSize, orphans };
}

async function safeApiCall<T>(
  action: string,
  request: () => Promise<APIResponse>,
  parse: (response: APIResponse) => Promise<T>,
): Promise<T>;
async function safeApiCall(
  action: string,
  request: () => Promise<APIResponse>,
  parse?: undefined,
  allowNotFound?: boolean,
): Promise<void>;
async function safeApiCall<T>(
  action: string,
  request: () => Promise<APIResponse>,
  parse?: (response: APIResponse) => Promise<T>,
  allowNotFound = false,
): Promise<T | void> {
  let response: APIResponse;
  try {
    response = await request();
  } catch {
    throw new Error(`Grafana ${action} request failed.`);
  }
  if (!response.ok() && !(allowNotFound && response.status() === 404)) {
    throw new Error(`Grafana ${action} failed with HTTP ${response.status()}.`);
  }
  if (!parse) {
    return;
  }
  try {
    return await parse(response);
  } catch {
    throw new Error(`Grafana ${action} returned an invalid response.`);
  }
}

function readJson(response: APIResponse): Promise<unknown> {
  return response.json();
}

type UserListParams = Partial<GrafanaUserListParams>;
type NumericGrafanaUser = Omit<GrafanaUser, 'id'> & { id: number };
type NumericGrafanaUserList = Omit<GrafanaUserList, 'users'> & { users: NumericGrafanaUser[] };

export async function listGrafanaUsers(
  api: APIRequestContext,
  params: UserListParams = {},
): Promise<NumericGrafanaUserList> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? GRAFANA_PAGE_SIZE;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('Grafana user list paging values were invalid.');
  }
  const value = await safeApiCall(
    'user list',
    () =>
      api.get(apiTarget(`${GRAFANA_ROUTE}/users`), {
        params: { ...(params.query !== undefined ? { query: params.query } : {}), page, pageSize },
        maxRedirects: 0,
      }),
    readJson,
  );
  return readGrafanaUserList(value);
}

async function findE2eUser(
  api: APIRequestContext,
  query: string,
  matches: (user: NumericGrafanaUser) => boolean,
): Promise<NumericGrafanaUser | undefined> {
  let page = 1;
  while (true) {
    const result = await listGrafanaUsers(api, { query, page, pageSize: GRAFANA_PAGE_SIZE });
    const user = result.users.find(matches);
    if (user) {
      try {
        assertE2eEmail(user.email);
      } catch {
        throw new Error(OWNERSHIP_ERROR);
      }
      return user;
    }
    if (result.users.length === 0 || page * GRAFANA_PAGE_SIZE >= result.count) {
      return undefined;
    }
    page += 1;
  }
}

async function requireE2eUserById(api: APIRequestContext, id: number): Promise<NumericGrafanaUser> {
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error(OWNERSHIP_ERROR);
  }
  const user = await findE2eUser(api, GRAFANA_E2E_QUERY, (candidate) => candidate.id === id);
  if (!user) {
    throw new Error(OWNERSHIP_ERROR);
  }
  return user;
}

function readCreatedUser(value: unknown, expectedEmail: string): NumericGrafanaUser {
  const user = readGrafanaUser(value);
  try {
    assertE2eEmail(user.email);
  } catch {
    throw new Error(OWNERSHIP_ERROR);
  }
  if (user.email.toLowerCase() !== expectedEmail.toLowerCase()) {
    throw new Error('Grafana create response did not match the requested test account.');
  }
  return user;
}

function assertE2eProjects(projectNames: string[]): void {
  if (!Array.isArray(projectNames)) {
    throw new Error('Grafana test projects must use e2e- names.');
  }
  projectNames.forEach(assertE2eProjectName);
}

export async function createGrafanaUser(
  api: APIRequestContext,
  data: GrafanaCreateUserBody,
): Promise<NumericGrafanaUser> {
  assertE2eEmail(data.email);
  assertE2eProjects(data.projectNames);
  const value = await safeApiCall(
    'user creation',
    () => api.post(apiTarget(`${GRAFANA_ROUTE}/users`), { data, maxRedirects: 0 }),
    readJson,
  );
  return readCreatedUser(value, data.email);
}

async function deleteGrafanaUser(api: APIRequestContext, id: number): Promise<void> {
  await requireE2eUserById(api, id);
  await safeApiCall('user deletion', () => api.delete(apiTarget(`${GRAFANA_ROUTE}/users/${id}`), { maxRedirects: 0 }));
}

async function findE2eUserByEmail(api: APIRequestContext, email: string): Promise<NumericGrafanaUser | undefined> {
  const target = email.toLowerCase();
  return findE2eUser(api, email, (candidate) => candidate.email.toLowerCase() === target);
}

export async function deleteGrafanaUserByEmail(
  api: APIRequestContext,
  playwright: PlaywrightWorkerArgs['playwright'],
  email: string,
): Promise<void> {
  assertE2eEmail(email);
  try {
    const user = await findE2eUserByEmail(api, email);
    if (user) {
      await deleteGrafanaUser(api, user.id);
      return;
    }
  } catch {
    await deleteGrafanaAccountByEmail(playwright, email);
    return;
  }
  await deleteGrafanaAccountByEmail(playwright, email);
}

export async function clearGrafanaOrphan(api: APIRequestContext, account: string): Promise<void> {
  assertE2eEmail(account);
  await safeApiCall(
    'orphan cleanup',
    () => api.delete(apiTarget(`${GRAFANA_ROUTE}/orphans/${encodeURIComponent(account)}`), { maxRedirects: 0 }),
    undefined,
    true,
  );
}
