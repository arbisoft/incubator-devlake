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
import { ACCESS_ROLE, ACCESS_STATUS, type AccessUser } from '@/api/access';
import { COMMON_COPY } from '@/ui';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { createDeferred } from '../__tests__/test-utils';
import { COPY, DEFAULT_PAGE_SIZE, ROLE_OPTIONS } from '../constants';

import { DevlakeUsers } from './users';

vi.mock('antd', async (importOriginal) => {
  const { withMockedAntdMessage } = await import('../__tests__/test-utils');
  return withMockedAntdMessage(importOriginal);
});

vi.mock('@/api', () => ({
  default: {
    access: { listUsers: vi.fn(), listDomains: vi.fn(), updateUser: vi.fn(), updateDomain: vi.fn() },
    auth: { methods: vi.fn() },
  },
}));

const access = vi.mocked(API.access);
const KEYWORD = 'zzz';
const TOTAL = 30;
const ADA_NAME = 'Ada Lovelace';
const BOB_NAME = 'Bob Barker';
const ADA_EMAIL = 'ada@example.com';
const BOB_EMAIL = 'bob@example.com';

const accessUser = (id: number, email: string, displayName: string): AccessUser => ({
  id,
  issuer: 'issuer',
  subject: `subject-${id}`,
  email,
  displayName,
  role: ACCESS_ROLE.MEMBER,
  status: ACCESS_STATUS.ACTIVE,
  hasLocalCredential: false,
});
const ADA = accessUser(1, ADA_EMAIL, ADA_NAME);
const BOB = accessUser(2, BOB_EMAIL, BOB_NAME);
const usersPage = (users: AccessUser[], count: number) => ({
  users,
  count,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
});

const setup = () =>
  renderWithTheme(
    <MemoryRouter>
      <DevlakeUsers />
    </MemoryRouter>,
  );

const badgeText = () => screen.getByText(COPY.users.title).parentElement?.textContent;
const roleSelect = (email: string) =>
  screen.getByRole('combobox', { name: COPY.users.roleFor(email) }) as HTMLInputElement;

describe('DevlakeUsers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    access.listUsers.mockResolvedValue(usersPage([ADA, BOB], TOTAL));
    access.listDomains.mockResolvedValue({ domains: [], count: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE });
    access.updateUser.mockResolvedValue(ADA);
    vi.mocked(API.auth.methods).mockResolvedValue({});
  });

  it('shows no count before the first list arrives, then the loaded count', async () => {
    const first = createDeferred<ReturnType<typeof usersPage>>();
    access.listUsers.mockReturnValueOnce(first.promise);
    setup();
    await waitFor(() => expect(access.listUsers).toHaveBeenCalledTimes(1));
    expect(badgeText()).toBe(COPY.users.title);

    first.resolve(usersPage([ADA, BOB], TOTAL));
    await waitFor(() => expect(badgeText()).toBe(`${COPY.users.title}${TOTAL}`));
  });

  it('shows a zero count', async () => {
    access.listUsers.mockResolvedValue(usersPage([], 0));
    setup();
    await waitFor(() => expect(badgeText()).toBe(`${COPY.users.title}0`));
  });

  it('keeps the known count and hides the stale rows while a search is pending, then takes the new count', async () => {
    setup();
    await screen.findByText(ADA_NAME);
    const search = createDeferred<ReturnType<typeof usersPage>>();
    access.listUsers.mockReturnValueOnce(search.promise);
    fireEvent.change(screen.getByPlaceholderText(COPY.users.searchPlaceholder), { target: { value: KEYWORD } });
    fireEvent.click(screen.getByRole('button', { name: COMMON_COPY.search }));
    await waitFor(() => expect(access.listUsers).toHaveBeenCalledTimes(2));
    expect(badgeText()).toBe(`${COPY.users.title}${TOTAL}`);
    expect(screen.queryByText(ADA_NAME)).toBeNull();

    search.resolve(usersPage([BOB], 1));
    await waitFor(() => expect(badgeText()).toBe(`${COPY.users.title}1`));
    expect(await screen.findByText(BOB_NAME)).toBeTruthy();
  });

  it('keeps the known count while another page is pending', async () => {
    setup();
    await screen.findByText(ADA_NAME);
    const next = createDeferred<ReturnType<typeof usersPage>>();
    access.listUsers.mockReturnValueOnce(next.promise);
    fireEvent.click(screen.getByTitle('2'));
    await waitFor(() => expect(access.listUsers).toHaveBeenCalledTimes(2));
    expect(badgeText()).toBe(`${COPY.users.title}${TOTAL}`);

    next.resolve(usersPage([BOB], TOTAL));
    expect(await screen.findByText(BOB_NAME)).toBeTruthy();
    expect(badgeText()).toBe(`${COPY.users.title}${TOTAL}`);
  });

  it('marks only the user whose role is changing as pending and keeps the count through the refresh', async () => {
    const write = createDeferred<AccessUser>();
    access.updateUser.mockReturnValueOnce(write.promise);
    setup();
    await screen.findByText(ADA_NAME);
    fireEvent.mouseDown(roleSelect(ADA_EMAIL));
    fireEvent.click(await screen.findByTitle(ROLE_OPTIONS[1].label));
    await waitFor(() => expect(roleSelect(ADA_EMAIL).disabled).toBe(true));
    expect(roleSelect(ADA_EMAIL).closest('.ant-select')?.classList.contains('ant-select-loading')).toBe(true);
    expect(roleSelect(BOB_EMAIL).disabled).toBe(false);
    expect(access.updateUser).toHaveBeenCalledTimes(1);

    const refreshed = createDeferred<ReturnType<typeof usersPage>>();
    access.listUsers.mockReturnValueOnce(refreshed.promise);
    write.resolve(ADA);
    await waitFor(() => expect(access.listUsers).toHaveBeenCalledTimes(2));
    expect(badgeText()).toBe(`${COPY.users.title}${TOTAL}`);

    refreshed.resolve(usersPage([ADA, BOB], TOTAL));
    await waitFor(() => expect(roleSelect(ADA_EMAIL).disabled).toBe(false));
  });
});
