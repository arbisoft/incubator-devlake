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

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { GRAFANA_ROLE } from '@/api/grafana-users/constants';
import type { GrafanaUser, GrafanaUserList } from '@/api/grafana-users/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { createDeferred } from '../../__tests__/test-utils';
import { COPY } from '../constants';

import { user } from './__tests__/dialog-helpers';
import { GrafanaUsersCard } from './users-card';

vi.mock('antd', async (importOriginal) => {
  const { withMockedAntdMessage } = await import('../../__tests__/test-utils');
  return withMockedAntdMessage(importOriginal);
});

vi.mock('@/api', () => ({
  default: { grafanaUsers: { listUsers: vi.fn(), updateUser: vi.fn(), clearOrphan: vi.fn() } },
}));

const grafana = vi.mocked(API.grafanaUsers);
const ANN = user({ id: 1, email: 'ann@example.com', name: 'Ann Lee' });
const BOB = user({ id: 2, email: 'bob@example.com', name: 'Bob Ray' });
const ROOT = user({ id: 3, email: 'root@example.com', name: 'Root', protected: true });
const ORPHAN = 'gone@example.com';
const MODAL_SELECTOR = '.ant-modal';

const page = (patch: Partial<GrafanaUserList> = {}): GrafanaUserList => ({
  users: [ANN, BOB, ROOT],
  count: 3,
  page: 1,
  pageSize: 10,
  orphans: [],
  ...patch,
});

const setup = () =>
  renderWithTheme(
    <MemoryRouter>
      <GrafanaUsersCard />
    </MemoryRouter>,
  );

const roleSelect = (account: GrafanaUser) =>
  screen.getByRole('combobox', { name: COPY.actions.roleFor(account.email) }) as HTMLInputElement;

describe('GrafanaUsersCard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    grafana.listUsers.mockResolvedValue(page());
    grafana.updateUser.mockResolvedValue(ANN);
  });

  it('marks only the account whose role is changing as pending and keeps protected accounts locked', async () => {
    const write = createDeferred<GrafanaUser>();
    grafana.updateUser.mockReturnValueOnce(write.promise);
    setup();
    await screen.findByText(ANN.name);
    fireEvent.mouseDown(roleSelect(ANN));
    fireEvent.click(await screen.findByTitle(GRAFANA_ROLE.EDITOR));
    await waitFor(() => expect(roleSelect(ANN).disabled).toBe(true));
    expect(roleSelect(ANN).closest('.ant-select')?.classList.contains('ant-select-loading')).toBe(true);
    expect(roleSelect(BOB).disabled).toBe(false);
    expect(roleSelect(ROOT).disabled).toBe(true);
    expect(grafana.updateUser).toHaveBeenCalledTimes(1);

    write.resolve(ANN);
    await waitFor(() => expect(roleSelect(ANN).disabled).toBe(false));
    expect(roleSelect(ROOT).disabled).toBe(true);
  });

  it('does not offer a cleared orphan again while the refreshed list is pending', async () => {
    grafana.listUsers.mockResolvedValue(page({ orphans: [{ account: ORPHAN, projects: ['alpha'] }] }));
    setup();
    const notice = await screen.findByText(COPY.orphans.notice(1));
    const review = within(notice.parentElement as HTMLElement).getByRole('button', { name: COPY.actions.review });
    fireEvent.click(review);
    fireEvent.click(await screen.findByRole('button', { name: COPY.orphansDialog.clearFor(ORPHAN) }));

    const refreshed = createDeferred<GrafanaUserList>();
    grafana.listUsers.mockReturnValueOnce(refreshed.promise);
    const dialog = (await screen.findByText(COPY.orphansDialog.confirm.title(ORPHAN))).closest(
      MODAL_SELECTOR,
    ) as HTMLElement;
    fireEvent.click(within(dialog).getByRole('button', { name: COPY.orphansDialog.confirm.confirm }));
    await waitFor(() => expect(grafana.clearOrphan).toHaveBeenCalledWith(ORPHAN));
    const orphansDialog = screen.getByText(COPY.orphansDialog.title).closest(MODAL_SELECTOR) as HTMLElement;
    await waitFor(() => expect(orphansDialog.classList.contains('ant-zoom-leave-active')).toBe(true));
    fireEvent.transitionEnd(orphansDialog);
    await waitFor(() => expect(screen.queryByRole('button', { name: COPY.orphansDialog.clearFor(ORPHAN) })).toBeNull());

    fireEvent.click(review);
    expect(screen.queryByRole('button', { name: COPY.orphansDialog.clearFor(ORPHAN) })).toBeNull();

    refreshed.resolve(page());
    await waitFor(() => expect(screen.queryByText(COPY.orphans.notice(1))).toBeNull());
    expect(grafana.clearOrphan).toHaveBeenCalledTimes(1);
  });
});
