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

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Load the routes barrel first so the config/routes import cycle resolves as it does in the app.
import '@/routes';

import { ACCESS_ROLE } from '@/api/access';

import { ACCOUNT_MENU_KEY, COPY, FAILURE_COOLDOWN_MS, LINK_IDENTITY, THEME_MODE } from './constants';
import type { LayoutUser } from './types';
import { useAccountMenu, useIdentityLinkNotification } from './use-account-menu';

const providers = vi.hoisted(() => ({
  calls: 0,
  fail: false,
  list: [{ providerKey: 'acme', displayName: 'Acme SSO' }],
}));
vi.mock('@/api', () => ({
  default: {
    access: {
      listLinkableOIDCProviders: () => {
        providers.calls += 1;
        return providers.fail ? Promise.reject(new Error('unavailable')) : Promise.resolve(providers.list);
      },
    },
  },
}));
const messageMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('antd', async (importOriginal) => ({
  ...(await importOriginal<typeof import('antd')>()),
  message: messageMock,
}));

const USER: LayoutUser = { authenticated: true, name: 'Ada', email: 'ada@example.com', authenticationMethod: 'oidc' };
const ACCESS = { enabled: true, role: ACCESS_ROLE.MEMBER };

const setup = (props: { user?: LayoutUser | null; access?: { enabled: boolean } | null } = {}) =>
  renderHook(() =>
    useAccountMenu({
      version: 'v1',
      user: props.user === undefined ? USER : props.user,
      access: props.access === undefined ? ACCESS : props.access,
      themeMode: THEME_MODE.LIGHT,
      onSelectTheme: vi.fn(),
      handleLogout: vi.fn(),
    }),
  );

const itemKeys = (result: ReturnType<typeof setup>['result']) =>
  (result.current.accountMenuItems ?? []).map((item) => (item && 'key' in item ? item.key : undefined));

describe('useAccountMenu', () => {
  beforeEach(() => {
    providers.calls = 0;
    providers.fail = false;
  });
  afterEach(() => vi.useRealTimers());

  it('loads the linkable providers when the menu opens, and only once', async () => {
    const { result } = setup();
    act(() => result.current.loadLinkableProviders(true));
    await waitFor(() => expect(itemKeys(result)).toContain(`${ACCOUNT_MENU_KEY.LINK_IDENTITY_PREFIX}acme`));
    act(() => result.current.loadLinkableProviders(true));
    expect(providers.calls).toBe(1);
  });

  it('does not load when the menu closes, nobody is signed in or access control is off', () => {
    const { result } = setup();
    act(() => result.current.loadLinkableProviders(false));
    const anonymous = setup({ user: null });
    act(() => anonymous.result.current.loadLinkableProviders(true));
    const noAccess = setup({ access: { enabled: false } });
    act(() => noAccess.result.current.loadLinkableProviders(true));
    expect(providers.calls).toBe(0);
  });

  it('reports a failure and waits out the cooldown before trying again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    providers.fail = true;
    const { result } = setup();
    await act(async () => result.current.loadLinkableProviders(true));
    expect(itemKeys(result)).toContain(ACCOUNT_MENU_KEY.LINKABLE_PROVIDERS_FAILED);
    act(() => result.current.loadLinkableProviders(true));
    expect(providers.calls).toBe(1);
    vi.setSystemTime(Date.now() + FAILURE_COOLDOWN_MS + 1);
    await act(async () => result.current.loadLinkableProviders(true));
    expect(providers.calls).toBe(2);
  });
});

describe('useIdentityLinkNotification', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it.each([
    [LINK_IDENTITY.RESULT_LINKED, 'success', COPY.identityLink.linked],
    ['denied', 'error', COPY.identityLink.failed],
  ] as const)('shows the %s result once and removes it from the URL', (result, kind, text) => {
    window.history.replaceState(null, '', `/projects?keep=1&${LINK_IDENTITY.RESULT_PARAM}=${result}`);
    renderHook(() => useIdentityLinkNotification());
    expect(messageMock[kind]).toHaveBeenCalledWith(text);
    expect(window.location.search).toBe('?keep=1');
  });
});
