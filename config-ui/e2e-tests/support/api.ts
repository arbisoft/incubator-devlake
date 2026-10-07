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
import { APIRequestContext, APIResponse, PlaywrightWorkerArgs, expect } from '@playwright/test';

import { getAdminSessionToken } from '../auth-helpers';

import { API_URL } from './env';

const CSRF_TOKEN = 'e2e-csrf-token';

const E2E_PREFIX = 'e2e-';

export const uniqueName = (label: string) =>
  `${E2E_PREFIX}${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const DUMMY_TOKEN = 'e2e-dummy-token-not-real';

// Admin-authenticated request context against the DevLake API (session cookie plus double-submit CSRF).
export async function adminApi(playwright: PlaywrightWorkerArgs['playwright']): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: {
      Cookie: `devlake_session=${getAdminSessionToken()}; devlake_csrf=${CSRF_TOKEN}`,
      'X-CSRF-Token': CSRF_TOKEN,
    },
  });
}

async function json<T>(res: APIResponse, what: string): Promise<T> {
  expect(res.ok(), `${what} failed with ${res.status()}`).toBe(true);
  return (await res.json()) as T;
}

// Result of a fetch made from inside a page, or of a response the page received.
export interface PageResponse<T = unknown> {
  status: number;
  body: T | null;
}

export interface ApiMessage {
  message?: string;
}

export interface LinkableProvider {
  providerKey: string;
}

export interface ApiConnection {
  id: number;
  name: string;
  endpoint: string;
  authMethod?: string;
  token?: string;
  customHeaders?: { key: string; value: string }[];
  [key: string]: unknown;
}

export async function createConnection(
  api: APIRequestContext,
  plugin: string,
  payload: Record<string, unknown>,
): Promise<ApiConnection> {
  return json(await api.post(`/plugins/${plugin}/connections`, { data: payload }), `create ${plugin} connection`);
}

export const createGithubConnection = (api: APIRequestContext, name: string, token = DUMMY_TOKEN) =>
  createConnection(api, 'github', {
    name,
    endpoint: 'https://api.github.com/',
    authMethod: 'AccessToken',
    token,
    rateLimitPerHour: 4500,
  });

export async function getConnection(
  api: APIRequestContext,
  plugin: string,
  id: number,
): Promise<ApiConnection | undefined> {
  const res = await api.get(`/plugins/${plugin}/connections/${id}`);
  if (res.status() === 404) {
    return undefined;
  }
  return json(res, `get ${plugin} connection ${id}`);
}

export async function listConnections(api: APIRequestContext, plugin: string): Promise<ApiConnection[]> {
  return json(await api.get(`/plugins/${plugin}/connections`), `list ${plugin} connections`);
}

export async function findConnectionByName(
  api: APIRequestContext,
  plugin: string,
  name: string,
): Promise<ApiConnection | undefined> {
  return (await listConnections(api, plugin)).find((c) => c.name === name);
}

async function deleteScope(
  api: APIRequestContext,
  plugin: string,
  connectionId: number,
  scopeId: string | number,
): Promise<void> {
  await api.delete(`/plugins/${plugin}/connections/${connectionId}/scopes/${scopeId}`, {
    params: { delete_data_only: 'false' },
  });
}

// A connection with scopes cannot be deleted, so remove its scopes first.
export async function deleteConnection(api: APIRequestContext, plugin: string, id: number): Promise<void> {
  const scopesRes = await api.get(`/plugins/${plugin}/connections/${id}/scopes`, { params: { pageSize: 100 } });
  if (scopesRes.ok()) {
    const { scopes } = (await scopesRes.json()) as ApiScopeList;
    for (const { scope } of scopes ?? []) {
      const scopeId = scope.githubId ?? scope.id;
      if (scopeId !== undefined) {
        await deleteScope(api, plugin, id, scopeId);
      }
    }
  }
  await api.delete(`/plugins/${plugin}/connections/${id}`);
}

// Deletes every connection of a plugin whose name starts with the e2e prefix (leftovers of a failed run).
export async function deleteConnectionsByPrefix(api: APIRequestContext, plugin: string): Promise<void> {
  for (const c of await listConnections(api, plugin)) {
    if (c.name.startsWith(E2E_PREFIX)) {
      await deleteConnection(api, plugin, c.id);
    }
  }
}

interface ApiScope {
  id?: string | number;
  githubId?: number;
  name?: string;
  fullName?: string;
  [key: string]: unknown;
}

export interface ApiScopeList {
  count: number;
  scopes: { scope: ApiScope; scopeConfig?: Record<string, unknown> }[];
}

export async function listScopes(api: APIRequestContext, plugin: string, connectionId: number): Promise<ApiScopeList> {
  return json(
    await api.get(`/plugins/${plugin}/connections/${connectionId}/scopes`, { params: { pageSize: 100 } }),
    'list scopes',
  );
}

// Raw GitHub repo scope so no remote call is needed; githubId is arbitrary.
export async function putGithubScope(
  api: APIRequestContext,
  connectionId: number,
  repo: { githubId: number; fullName: string },
): Promise<void> {
  const [owner, name] = repo.fullName.split('/');
  const res = await api.put(`/plugins/github/connections/${connectionId}/scopes`, {
    data: {
      data: [
        {
          connectionId,
          githubId: repo.githubId,
          name,
          fullName: repo.fullName,
          htmlUrl: `https://github.com/${repo.fullName}`,
          cloneUrl: `https://github.com/${repo.fullName}.git`,
          owner,
        },
      ],
    },
  });
  expect(res.ok(), `put github scope failed with ${res.status()}`).toBe(true);
}

export interface ApiProject {
  name: string;
  description?: string;
  blueprint?: ApiBlueprint;
  [key: string]: unknown;
}

export interface ApiBlueprint {
  id: number;
  name: string;
  cronConfig: string;
  isManual: boolean;
  skipOnFail?: boolean;
  timeAfter?: string | null;
  enable: boolean;
  connections: { pluginName: string; connectionId: number; scopes: { scopeId: string }[] }[];
  [key: string]: unknown;
}

export async function createProject(api: APIRequestContext, name: string): Promise<ApiProject> {
  return json(
    await api.post('/projects', {
      data: { name, description: '', metrics: [{ pluginName: 'dora', pluginOption: '', enable: true }] },
    }),
    'create project',
  );
}

export async function getProject(api: APIRequestContext, name: string): Promise<ApiProject | undefined> {
  const res = await api.get(`/projects/${encodeURIComponent(name)}`);
  if (res.status() === 404) {
    return undefined;
  }
  return json(res, `get project ${name}`);
}

// Cancels any active pipeline first, since a project with a running pipeline cannot be removed.
export async function deleteProject(api: APIRequestContext, name: string): Promise<void> {
  const project = await getProject(api, name);
  if (!project) {
    return;
  }
  if (project.blueprint) {
    const blueprintId = project.blueprint.id;
    await cancelPipelinesOfBlueprint(api, blueprintId);
    await expect
      .poll(async () =>
        (await listBlueprintPipelines(api, blueprintId)).every((p) => isTerminalPipelineStatus(p.status)),
      )
      .toBe(true);
  }
  const res = await api.delete(`/projects/${encodeURIComponent(name)}`);
  expect(res.ok(), `delete project ${name} failed with ${res.status()}`).toBe(true);
}

export async function createBlueprint(
  api: APIRequestContext,
  name: string,
  options: { enable?: boolean } = {},
): Promise<ApiBlueprint> {
  return json(
    await api.post('/blueprints', {
      data: {
        name,
        mode: 'NORMAL',
        enable: options.enable ?? true,
        cronConfig: '0 0 * * *',
        isManual: false,
        skipOnFail: true,
        connections: [],
      },
    }),
    `create blueprint ${name}`,
  );
}

// A blueprint with no connections answers 400 yet still records a pipeline that completes at once.
export async function triggerBlueprint(api: APIRequestContext, blueprintId: number): Promise<void> {
  await api.post(`/blueprints/${blueprintId}/trigger`, { data: { skipCollectors: false, fullSync: false } });
  await expect.poll(async () => (await listBlueprintPipelines(api, blueprintId)).length).toBeGreaterThan(0);
}

async function deleteBlueprint(api: APIRequestContext, blueprintId: number): Promise<void> {
  await cancelPipelinesOfBlueprint(api, blueprintId);
  await api.delete(`/blueprints/${blueprintId}`);
}

export async function listBlueprintsByKeyword(api: APIRequestContext, keyword: string): Promise<ApiBlueprint[]> {
  const res = await json<{ blueprints: ApiBlueprint[] }>(
    await api.get('/blueprints', { params: { type: 'ALL', keyword, pageSize: 100 } }),
    'list blueprints',
  );
  return res.blueprints ?? [];
}

export async function deleteBlueprintsByPrefix(api: APIRequestContext, prefix: string): Promise<void> {
  for (const blueprint of await listBlueprintsByKeyword(api, prefix)) {
    if (blueprint.name.startsWith(prefix)) {
      await deleteBlueprint(api, blueprint.id);
    }
  }
}

export interface ApiPipeline {
  id: number;
  name: string;
  status: string;
  blueprintId?: number;
  [key: string]: unknown;
}

const ACTIVE_PIPELINE_STATUSES = ['TASK_CREATED', 'TASK_PENDING', 'TASK_ACTIVE', 'TASK_RUNNING', 'TASK_RERUN'];

export async function listBlueprintPipelines(api: APIRequestContext, blueprintId: number): Promise<ApiPipeline[]> {
  const res = await json<{ pipelines: ApiPipeline[] }>(
    await api.get(`/blueprints/${blueprintId}/pipelines`, { params: { pageSize: 50 } }),
    'list blueprint pipelines',
  );
  return res.pipelines ?? [];
}

export async function getPipeline(api: APIRequestContext, id: number): Promise<ApiPipeline> {
  return json(await api.get(`/pipelines/${id}`), `get pipeline ${id}`);
}

async function cancelPipeline(api: APIRequestContext, id: number): Promise<void> {
  await api.delete(`/pipelines/${id}`);
}

export async function cancelPipelinesOfBlueprint(api: APIRequestContext, blueprintId: number): Promise<void> {
  for (const p of await listBlueprintPipelines(api, blueprintId)) {
    if (ACTIVE_PIPELINE_STATUSES.includes(p.status)) {
      await cancelPipeline(api, p.id);
    }
  }
}

export const isTerminalPipelineStatus = (status: string) => !ACTIVE_PIPELINE_STATUSES.includes(status);

export async function listWebhooks(api: APIRequestContext): Promise<{ id: number; name: string }[]> {
  return json(await api.get('/plugins/webhook/connections'), 'list webhooks');
}

export async function deleteWebhooksByPrefix(api: APIRequestContext): Promise<void> {
  for (const w of await listWebhooks(api)) {
    if (w.name.startsWith(E2E_PREFIX)) {
      await api.delete(`/plugins/webhook/connections/${w.id}`);
    }
  }
}

export interface ApiKey {
  id: string;
  name: string;
  allowedPath: string;
  expiredAt: string | null;
  [key: string]: unknown;
}

export async function listApiKeys(api: APIRequestContext): Promise<ApiKey[]> {
  const res = await json<{ apikeys: ApiKey[] }>(
    await api.get('/api-keys', { params: { pageSize: 100 } }),
    'list api keys',
  );
  return res.apikeys ?? [];
}

export async function createApiKey(api: APIRequestContext, name: string, expiredAt?: string): Promise<ApiKey> {
  return json(
    await api.post('/api-keys', { data: { name, expiredAt, allowedPath: '.*', type: 'devlake' } }),
    `create api key ${name}`,
  );
}

export async function deleteApiKeysByPrefix(api: APIRequestContext): Promise<void> {
  for (const key of await listApiKeys(api)) {
    if (key.name.startsWith(E2E_PREFIX)) {
      await api.delete(`/api-keys/${key.id}`);
    }
  }
}

export interface ApiAccessUser {
  id: number;
  role: string;
  status: string;
  displayName: string;
  localLoginName?: string;
  hasLocalCredential: boolean;
  [key: string]: unknown;
}

// Pages through the visible (non-hidden) access directory, 50 users at a time.
export async function listAccessUsers(api: APIRequestContext): Promise<ApiAccessUser[]> {
  const users: ApiAccessUser[] = [];
  for (let page = 1; ; page++) {
    const body = await json<{ users: ApiAccessUser[]; count: number }>(
      await api.get('/access/users', { params: { page, pageSize: 50 } }),
      'list access users',
    );
    users.push(...(body.users ?? []));
    if (users.length >= body.count || (body.users ?? []).length === 0) {
      return users;
    }
  }
}

export async function findAccessUserByLogin(
  api: APIRequestContext,
  loginName: string,
): Promise<ApiAccessUser | undefined> {
  return (await listAccessUsers(api)).find((u) => u.localLoginName === loginName);
}

export interface ApiOidcProvider {
  providerKey: string;
  enabled: boolean;
  [key: string]: unknown;
}

async function listOidcProviders(api: APIRequestContext): Promise<ApiOidcProvider[]> {
  return json(await api.get('/access/oidc-providers'), 'list oidc providers');
}

export async function findOidcProvider(
  api: APIRequestContext,
  providerKey: string,
): Promise<ApiOidcProvider | undefined> {
  return (await listOidcProviders(api)).find((p) => p.providerKey === providerKey);
}

export interface ApiOtelConnection {
  connection: { id: number; teamName: string; status: string; organizationId?: string | null };
  credentials: { id: number; status: string }[];
  projects: { name: string }[];
}

async function listOtelConnections(api: APIRequestContext): Promise<ApiOtelConnection[]> {
  return json(await api.get('/plugins/claude_otel/connections'), 'list otel connections');
}

export async function findOtelConnection(
  api: APIRequestContext,
  teamName: string,
): Promise<ApiOtelConnection | undefined> {
  return (await listOtelConnections(api)).find((it) => it.connection.teamName === teamName);
}

// Credential statuses of a connection, sorted so a spec can compare them with toEqual.
export const otelCredentialStatuses = (entry: ApiOtelConnection | undefined): string[] =>
  (entry?.credentials ?? []).map((c) => c.status).sort();
