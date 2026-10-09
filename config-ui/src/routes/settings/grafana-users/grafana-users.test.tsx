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

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { GRAFANA_ERROR_CODE, GRAFANA_ROLE } from '@/api/grafana-users/constants';
import type { GrafanaUser, GrafanaUserList } from '@/api/grafana-users/types';
import { COMMON_COPY } from '@/ui';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY, MAX_VISIBLE_PROJECTS } from './constants';
import { GrafanaUsers } from './grafana-users';

vi.mock('@/api', () => ({ default: { grafanaUsers: { status: vi.fn(), listUsers: vi.fn() } } }));

const status = vi.mocked(API.grafanaUsers.status);
const listUsers = vi.mocked(API.grafanaUsers.listUsers);

const user = (patch: Partial<GrafanaUser>): GrafanaUser => ({
  id: 1,
  email: 'ann@example.com',
  name: 'Ann Lee',
  role: GRAFANA_ROLE.VIEWER,
  disabled: false,
  sso: false,
  protected: false,
  projects: [],
  ...patch,
});

const list = (patch: Partial<GrafanaUserList> = {}): GrafanaUserList => ({
  users: [user({})],
  count: 1,
  page: 1,
  pageSize: 10,
  orphans: [],
  ...patch,
});

const setup = (path = '/') =>
  renderWithTheme(
    <MemoryRouter initialEntries={[path]}>
      <GrafanaUsers />
    </MemoryRouter>,
  );

describe('GrafanaUsers', () => {
  beforeEach(() => {
    status.mockReset().mockResolvedValue({ available: true });
    listUsers.mockReset().mockResolvedValue(list());
  });

  it('shows the status copy with a retry, and no search, table or list call, when Grafana is unavailable', async () => {
    status.mockResolvedValue({ available: false, code: GRAFANA_ERROR_CODE.NOT_CONFIGURED });
    setup();
    expect(await screen.findByText(COPY.errors[GRAFANA_ERROR_CODE.NOT_CONFIGURED])).toBeTruthy();
    expect(screen.queryByPlaceholderText(COPY.searchPlaceholder)).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: COMMON_COPY.retry }));
    await waitFor(() => expect(status).toHaveBeenCalledTimes(2));
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('falls back to the unreachable copy when the status request fails', async () => {
    status.mockRejectedValue(new Error('network'));
    setup();
    expect(await screen.findByText(COPY.errors[GRAFANA_ERROR_CODE.UNAVAILABLE])).toBeTruthy();
  });

  it('lists the users with their role, projects, status, SSO mark and the count', async () => {
    const projects = Array.from({ length: MAX_VISIBLE_PROJECTS + 2 }, (_, index) => `project-${index}`);
    listUsers.mockResolvedValue(
      list({
        count: 2,
        users: [
          user({ id: 1, sso: true, role: GRAFANA_ROLE.ADMIN, projects }),
          user({ id: 2, email: 'bob@example.com', name: 'Bob', role: 'None', disabled: true }),
        ],
      }),
    );
    setup();
    expect(await screen.findByText('Ann Lee')).toBeTruthy();
    expect(screen.getByRole('table', { name: COPY.tableLabel })).toBeTruthy();
    expect(screen.getByRole('img', { name: COPY.sso.label })).toBeTruthy();
    expect(screen.getByText(GRAFANA_ROLE.ADMIN)).toBeTruthy();
    expect(screen.getByText('None')).toBeTruthy();
    expect(screen.getByText(COPY.moreProjects(2))).toBeTruthy();
    expect(screen.getByText(COPY.status.active)).toBeTruthy();
    expect(screen.getByText(COPY.status.disabled)).toBeTruthy();
    expect(screen.getByRole('region', { name: COPY.title }).textContent).toContain('2');
  });

  it('asks for the page and keyword in the URL', async () => {
    setup('/?keyword=ann&page=2&pageSize=25');
    await screen.findByText('Ann Lee');
    expect(listUsers).toHaveBeenCalledWith({ page: 2, pageSize: 25, query: 'ann' }, expect.any(AbortSignal));
  });

  it('shows the orphans notice only when there are orphans, with the right plural', async () => {
    listUsers.mockResolvedValue(list({ orphans: [{ account: 'gone@example.com', projects: ['a'] }] }));
    const { unmount } = setup();
    expect(await screen.findByText(COPY.orphans.notice(1))).toBeTruthy();
    unmount();

    listUsers.mockResolvedValue(
      list({
        orphans: [
          { account: 'a', projects: [] },
          { account: 'b', projects: [] },
        ],
      }),
    );
    const second = setup();
    expect(await screen.findByText(COPY.orphans.notice(2))).toBeTruthy();
    second.unmount();

    listUsers.mockResolvedValue(list());
    setup();
    await screen.findByText('Ann Lee');
    expect(screen.queryByText(/saved dashboard mapping/)).toBeNull();
  });

  it('shows the empty state when there are no users', async () => {
    listUsers.mockResolvedValue(list({ users: [], count: 0 }));
    setup();
    expect(await screen.findByText(COPY.empty.title)).toBeTruthy();
  });

  it('shows the no-results state and keeps the keyword', async () => {
    listUsers.mockResolvedValue(list({ users: [], count: 0 }));
    setup('/?keyword=zzz');
    expect(await screen.findByText(COPY.noResults.title)).toBeTruthy();
    expect(screen.getByPlaceholderText<HTMLInputElement>(COPY.searchPlaceholder).value).toBe('zzz');
  });

  it('retries a failed list with the same query', async () => {
    listUsers.mockRejectedValueOnce(new Error('boom'));
    setup('/?keyword=ann');
    fireEvent.click(await screen.findByRole('button', { name: COMMON_COPY.retry }));
    expect(await screen.findByText('Ann Lee')).toBeTruthy();
    expect(listUsers).toHaveBeenCalledTimes(2);
    expect(listUsers.mock.calls[1][0]).toEqual(listUsers.mock.calls[0][0]);
  });
});
