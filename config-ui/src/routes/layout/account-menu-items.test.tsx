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

import type { MenuProps } from 'antd';
import { describe, expect, it, vi } from 'vitest';

import type { ThemeMode } from '@/theme/tokens';

import { getAccountMenuItems } from './account-menu-items';
import { ACCOUNT_MENU_KEY, COPY, THEME_LABEL, THEME_MODE, THEME_MODES } from './constants';
import type { AccountMenuHandlers, AccountMenuState, LayoutUser } from './types';

type Item = NonNullable<MenuProps['items']>[number];
type Entry = { key?: string; label?: unknown; disabled?: boolean; type?: string; children?: Entry[]; extra?: unknown };

const LOCAL: LayoutUser = { authenticated: true, name: 'Ada', email: 'ada@example.com', authenticationMethod: 'local' };
const OIDC: LayoutUser = { ...LOCAL, authenticationMethod: 'oidc' };
const PROVIDER = { providerKey: 'acme', displayName: 'Acme SSO' };

const handlers = (): AccountMenuHandlers => ({
  onSelectTheme: vi.fn(),
  onChangePassword: vi.fn(),
  onLinkIdentity: vi.fn(),
  onSignOut: vi.fn(),
});

const build = (state: Partial<AccountMenuState> = {}, h = handlers()) =>
  (
    getAccountMenuItems(
      {
        version: 'v1.2.3',
        user: LOCAL,
        linkableProviders: undefined,
        linkProvidersFailed: false,
        themeMode: THEME_MODE.SYSTEM,
        ...state,
      },
      h,
    ) as Entry[]
  ).filter((item) => item.type !== 'divider');

const keys = (items: Entry[]) => items.map((item) => item.key);
const find = (items: Entry[], key: string): Entry | undefined => items.find((item) => item.key === key);
const themeItems = (items: Entry[]) => find(items, ACCOUNT_MENU_KEY.THEME)?.children ?? [];
const click = (item: Entry | undefined) => (item as { onClick?: () => void } | undefined)?.onClick?.();

describe('getAccountMenuItems', () => {
  it('lists the version first, as a disabled item, and leaves it out when unknown', () => {
    const [first] = build();
    expect(first).toMatchObject({
      key: ACCOUNT_MENU_KEY.VERSION,
      label: COPY.account.version('v1.2.3'),
      disabled: true,
    });
    expect(keys(build({ version: '' }))).not.toContain(ACCOUNT_MENU_KEY.VERSION);
  });

  it('offers light, dark and system to everyone, even when nobody is signed in', () => {
    [LOCAL, OIDC, { ...LOCAL, authenticated: false }, null].forEach((user) => {
      const items = build({ user });
      expect(themeItems(items).map((item) => item.label)).toEqual(THEME_MODES.map((mode) => THEME_LABEL[mode]));
    });
    expect(keys(build({ user: null }))).toEqual([ACCOUNT_MENU_KEY.VERSION, ACCOUNT_MENU_KEY.THEME]);
  });

  it('marks only the current theme and reports the chosen one', () => {
    const h = handlers();
    const items = build({ themeMode: THEME_MODE.DARK }, h);
    const marked = themeItems(items).filter((item) => item.extra !== undefined);
    expect(marked.map((item) => item.key)).toEqual([`${ACCOUNT_MENU_KEY.THEME_PREFIX}${THEME_MODE.DARK}`]);
    THEME_MODES.forEach((mode: ThemeMode) => {
      click(find(themeItems(items), `${ACCOUNT_MENU_KEY.THEME_PREFIX}${mode}`));
      expect(h.onSelectTheme).toHaveBeenLastCalledWith(mode);
    });
  });

  it('offers change password to local users only', () => {
    const h = handlers();
    click(find(build({ user: LOCAL }, h), ACCOUNT_MENU_KEY.CHANGE_PASSWORD));
    expect(h.onChangePassword).toHaveBeenCalledOnce();
    expect(find(build({ user: LOCAL }), ACCOUNT_MENU_KEY.CHANGE_PASSWORD)?.label).toBe(COPY.account.changePassword);
    expect(keys(build({ user: OIDC }))).not.toContain(ACCOUNT_MENU_KEY.CHANGE_PASSWORD);
  });

  it('lists one add-sign-in item per linkable provider and starts the link for the chosen one', () => {
    const h = handlers();
    const items = build({ user: OIDC, linkableProviders: [PROVIDER] }, h);
    const link = find(items, `${ACCOUNT_MENU_KEY.LINK_IDENTITY_PREFIX}${PROVIDER.providerKey}`);
    expect(link?.label).toBe(COPY.account.addProviderSignIn(PROVIDER.displayName));
    click(link);
    expect(h.onLinkIdentity).toHaveBeenCalledWith(PROVIDER.providerKey);
    expect(keys(items)).not.toContain(ACCOUNT_MENU_KEY.NO_LINKABLE_PROVIDERS);
  });

  it('says so when there are no additional providers, or when they could not be loaded', () => {
    const none = find(build({ linkableProviders: [] }), ACCOUNT_MENU_KEY.NO_LINKABLE_PROVIDERS);
    expect(none).toMatchObject({ label: COPY.account.noProviders, disabled: true });
    const failed = find(build({ linkProvidersFailed: true }), ACCOUNT_MENU_KEY.LINKABLE_PROVIDERS_FAILED);
    expect(failed).toMatchObject({ label: COPY.account.providersUnavailable, disabled: true });
    expect(keys(build())).not.toContain(ACCOUNT_MENU_KEY.NO_LINKABLE_PROVIDERS);
  });

  it('ends with sign out for a signed-in user and calls the sign-out handler', () => {
    const h = handlers();
    const items = build({ user: OIDC }, h);
    const last = items[items.length - 1];
    expect(last).toMatchObject({ key: ACCOUNT_MENU_KEY.SIGN_OUT, label: COPY.account.signOut });
    click(last);
    expect(h.onSignOut).toHaveBeenCalledOnce();
  });

  it('has no sign-in or sign-out items when nobody is signed in', () => {
    const items = build({ user: { ...LOCAL, authenticated: false }, linkableProviders: [PROVIDER] });
    expect(keys(items)).toEqual([ACCOUNT_MENU_KEY.VERSION, ACCOUNT_MENU_KEY.THEME]);
  });

  it('separates the version, theme and account sections with dividers', () => {
    const all = getAccountMenuItems(
      {
        version: 'v1',
        user: LOCAL,
        linkableProviders: undefined,
        linkProvidersFailed: false,
        themeMode: THEME_MODE.LIGHT,
      },
      handlers(),
    ) as Item[];
    expect(all.filter((item) => item && 'type' in item && item.type === 'divider')).toHaveLength(3);
  });
});
