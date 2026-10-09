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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { request } from '@/utils';

import * as grafanaUsers from './index';

vi.mock('@/utils', () => ({ request: vi.fn().mockResolvedValue(undefined) }));

const requestMock = vi.mocked(request);
const { signal } = new AbortController();
const EMAIL = 'ann@example.com';
const PASSWORD = 'a-long-enough-password';

describe('grafana users API', () => {
  beforeEach(() => requestMock.mockClear());

  it('loads the status with the abort signal', async () => {
    await grafanaUsers.status(signal);
    expect(requestMock).toHaveBeenCalledWith('/access/grafana/status', { signal });
  });

  it('lists users with the query, page, page size and signal', async () => {
    const params = { query: 'ann', page: 2, pageSize: 25 };
    await grafanaUsers.listUsers(params, signal);
    expect(requestMock).toHaveBeenCalledWith('/access/grafana/users', { data: params, signal });
  });

  it('creates a user with the whole body', async () => {
    const body = {
      email: EMAIL,
      name: 'Ann',
      role: grafanaUsers.GRAFANA_ROLE.EDITOR,
      projectNames: ['demo'],
      password: PASSWORD,
    };
    await grafanaUsers.createUser(body);
    expect(requestMock).toHaveBeenCalledWith('/access/grafana/users', { method: 'POST', data: body });
  });

  it('patches only the fields it is given', async () => {
    await grafanaUsers.updateUser(7, { disabled: true });
    expect(requestMock).toHaveBeenCalledWith('/access/grafana/users/7', { method: 'PATCH', data: { disabled: true } });
  });

  it('replaces the project set', async () => {
    await grafanaUsers.setProjects(7, ['a', 'b']);
    expect(requestMock).toHaveBeenCalledWith('/access/grafana/users/7/projects', {
      method: 'PUT',
      data: { projectNames: ['a', 'b'] },
    });
  });

  it('sets a password', async () => {
    await grafanaUsers.setPassword(7, PASSWORD);
    expect(requestMock).toHaveBeenCalledWith('/access/grafana/users/7/password', {
      method: 'PUT',
      data: { password: PASSWORD },
    });
  });

  it('deletes a user', async () => {
    await grafanaUsers.deleteUser(7);
    expect(requestMock).toHaveBeenCalledWith('/access/grafana/users/7', { method: 'DELETE' });
  });

  it('clears an orphan by its encoded account', async () => {
    await grafanaUsers.clearOrphan('old/login@example.com');
    expect(requestMock).toHaveBeenCalledWith('/access/grafana/orphans/old%2Flogin%40example.com', {
      method: 'DELETE',
    });
  });

  it('never sends a login field', async () => {
    await grafanaUsers.createUser({
      email: 'a@example.com',
      name: 'A',
      role: grafanaUsers.GRAFANA_ROLE.VIEWER,
      projectNames: [],
      password: PASSWORD,
    });
    await grafanaUsers.updateUser(1, { email: 'b@example.com' });
    const bodies = requestMock.mock.calls.map(([, config]) => JSON.stringify(config?.data ?? {}));
    expect(bodies.some((body) => body.includes('login'))).toBe(false);
  });
});
