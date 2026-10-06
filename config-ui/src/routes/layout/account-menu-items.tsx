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

import {
  CheckOutlined,
  DesktopOutlined,
  KeyOutlined,
  LogoutOutlined,
  MoonOutlined,
  SunOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import type { ReactNode } from 'react';

import type { ThemeMode } from '@/theme/tokens';

import { ACCOUNT_MENU_KEY, COPY, THEME_LABEL, THEME_MODE, THEME_MODES } from './constants';
import type { AccountMenuHandlers, AccountMenuState } from './types';

type MenuItems = NonNullable<MenuProps['items']>;

const THEME_ICON: Record<ThemeMode, ReactNode> = {
  [THEME_MODE.LIGHT]: <SunOutlined aria-hidden />,
  [THEME_MODE.DARK]: <MoonOutlined aria-hidden />,
  [THEME_MODE.SYSTEM]: <DesktopOutlined aria-hidden />,
};

const getThemeItems = (themeMode: ThemeMode, onSelectTheme: AccountMenuHandlers['onSelectTheme']): MenuItems => [
  {
    type: 'group',
    key: ACCOUNT_MENU_KEY.THEME,
    label: COPY.account.theme,
    children: THEME_MODES.map((mode) => ({
      key: `${ACCOUNT_MENU_KEY.THEME_PREFIX}${mode}`,
      icon: THEME_ICON[mode],
      label: THEME_LABEL[mode],
      extra: mode === themeMode ? <CheckOutlined role="img" aria-label={COPY.account.selected} /> : undefined,
      onClick: () => onSelectTheme(mode),
    })),
  },
];

const getSignInItems = (
  { user, linkableProviders, linkProvidersFailed }: AccountMenuState,
  { onChangePassword, onLinkIdentity }: AccountMenuHandlers,
): MenuItems => [
  ...(user?.authenticationMethod === 'local'
    ? [
        {
          key: ACCOUNT_MENU_KEY.CHANGE_PASSWORD,
          icon: <KeyOutlined aria-hidden />,
          label: COPY.account.changePassword,
          onClick: onChangePassword,
        },
      ]
    : []),
  ...(linkableProviders?.map((provider) => ({
    key: `${ACCOUNT_MENU_KEY.LINK_IDENTITY_PREFIX}${provider.providerKey}`,
    label: COPY.account.addProviderSignIn(provider.displayName),
    onClick: () => onLinkIdentity(provider.providerKey),
  })) ?? []),
  ...(linkableProviders?.length === 0
    ? [{ key: ACCOUNT_MENU_KEY.NO_LINKABLE_PROVIDERS, disabled: true, label: COPY.account.noProviders }]
    : []),
  ...(linkProvidersFailed
    ? [{ key: ACCOUNT_MENU_KEY.LINKABLE_PROVIDERS_FAILED, disabled: true, label: COPY.account.providersUnavailable }]
    : []),
];

export const getAccountMenuItems = (state: AccountMenuState, handlers: AccountMenuHandlers): MenuItems => {
  const signedIn = state.user?.authenticated === true;

  return [
    ...(state.version
      ? [
          { key: ACCOUNT_MENU_KEY.VERSION, disabled: true, label: COPY.account.version(state.version) },
          { type: 'divider' as const, key: ACCOUNT_MENU_KEY.VERSION_DIVIDER },
        ]
      : []),
    ...getThemeItems(state.themeMode, handlers.onSelectTheme),
    ...(signedIn
      ? [
          { type: 'divider' as const, key: ACCOUNT_MENU_KEY.ACCOUNT_DIVIDER },
          ...getSignInItems(state, handlers),
          { type: 'divider' as const, key: ACCOUNT_MENU_KEY.SIGN_OUT_DIVIDER },
          {
            key: ACCOUNT_MENU_KEY.SIGN_OUT,
            icon: <LogoutOutlined aria-hidden />,
            label: COPY.account.signOut,
            onClick: handlers.onSignOut,
          },
        ]
      : []),
  ];
};
