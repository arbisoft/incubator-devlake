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
  ApiOutlined,
  BarChartOutlined,
  BookOutlined,
  BuildOutlined,
  ExperimentOutlined,
  GithubOutlined,
  HistoryOutlined,
  KeyOutlined,
  LockOutlined,
  MailOutlined,
  PartitionOutlined,
  ProjectOutlined,
  SettingOutlined,
  SlackOutlined,
  TeamOutlined,
} from '@ant-design/icons';

import type { ComponentType } from 'react';

import { THEME_MODE } from '@/theme/constants';
import type { ThemeMode } from '@/theme/tokens';

// NAV_GATE names who can see a nav item. An item without a gate is shown to everyone.
export const NAV_GATE = {
  ACCESS: 'access', // customer administrators, when access control is on
  ADMIN: 'admin', // administrators, or everyone when access control is off
  COPYRIGHT: 'copyright', // hidden when the copyright is hidden
} as const;

// NAV is every sidebar item: its key, label, icon and who sees it. nav.ts places them in the tree.
export const NAV = {
  PROJECTS: { key: 'projects', label: 'Projects', icon: ProjectOutlined },
  CONNECTIONS: { key: 'connections', label: 'Connections', icon: ApiOutlined },
  ADVANCED: { key: 'advanced', label: 'Advanced', icon: ExperimentOutlined },
  BLUEPRINTS: { key: 'blueprints', label: 'Blueprints', icon: BuildOutlined },
  PIPELINES: { key: 'pipelines', label: 'Pipelines', icon: PartitionOutlined },
  API_KEYS: { key: 'api-keys', label: 'API Keys', icon: KeyOutlined, gate: NAV_GATE.ADMIN },
  EMAIL_HISTORY: { key: 'email-history', label: 'Email History', icon: MailOutlined, gate: NAV_GATE.ADMIN },
  SETTINGS: { key: 'settings', label: 'Settings', icon: SettingOutlined, gate: NAV_GATE.ACCESS },
  USERS: { key: 'users', label: 'User Management', icon: TeamOutlined, gate: NAV_GATE.ACCESS },
  AUTHENTICATION: { key: 'authentication', label: 'Authentication', icon: LockOutlined, gate: NAV_GATE.ACCESS },
  ACTIVITY: { key: 'activity', label: 'Recent Activities', icon: HistoryOutlined, gate: NAV_GATE.ACCESS },
  RESOURCES: { key: 'resources', label: 'Resources', icon: BookOutlined },
  DOCS: { key: 'docs', label: 'Docs', icon: BookOutlined },
  API: { key: 'api', label: 'API', icon: ApiOutlined },
  GITHUB: { key: 'github', label: 'GitHub', icon: GithubOutlined, gate: NAV_GATE.COPYRIGHT },
  SLACK: { key: 'slack', label: 'Slack', icon: SlackOutlined, gate: NAV_GATE.COPYRIGHT },
  DASHBOARDS: { key: 'dashboards', label: 'Dashboards', icon: BarChartOutlined, gate: NAV_GATE.COPYRIGHT },
} as const satisfies Record<
  string,
  // NavMeta in types.ts; spelled out here so the e2e tests can import this file without the app's types
  { key: string; label: string; icon: ComponentType; gate?: (typeof NAV_GATE)[keyof typeof NAV_GATE] }
>;

export const NAV_DIVIDER_KEY = 'divider';

export const ACCOUNT_MENU_KEY = {
  VERSION: 'version',
  VERSION_DIVIDER: 'version-divider',
  THEME: 'theme',
  THEME_PREFIX: 'theme-',
  ACCOUNT_DIVIDER: 'account-divider',
  CHANGE_PASSWORD: 'change-password',
  LINK_IDENTITY_PREFIX: 'link-identity-',
  NO_LINKABLE_PROVIDERS: 'no-linkable-providers',
  LINKABLE_PROVIDERS_FAILED: 'linkable-providers-failed',
  SIGN_OUT_DIVIDER: 'sign-out-divider',
  SIGN_OUT: 'logout',
} as const;

export const FAILURE_COOLDOWN_MS = 10_000;

export const INIT_STATUS = { IDLE: 'idle', LOADING: 'loading', FAILED: 'failed' } as const;

export const LINK_IDENTITY = {
  PATH: '/auth/link-identity',
  PROVIDER_PARAM: 'provider',
  RETURN_URL_PARAM: 'return_url',
  RESULT_PARAM: 'identity_link',
  RESULT_LINKED: 'linked',
} as const;

export const COPY = {
  initializationFailed: 'The application could not be initialized. Reload and try again.',
  account: {
    fallbackName: 'Account',
    version: (version: string) => `Version ${version}`,
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    selected: 'Selected',
    changePassword: 'Change password',
    addProviderSignIn: (provider: string) => `Add ${provider} sign-in`,
    noProviders: 'No additional sign-in providers',
    providersUnavailable: 'Additional sign-in methods are unavailable',
    signOut: 'Sign out',
  },
  identityLink: {
    linked: 'Additional sign-in method added.',
    failed: 'The additional sign-in method could not be added. Please try again.',
  },
} as const;

export const THEME_LABEL: Record<ThemeMode, string> = {
  [THEME_MODE.LIGHT]: COPY.account.themeLight,
  [THEME_MODE.DARK]: COPY.account.themeDark,
  [THEME_MODE.SYSTEM]: COPY.account.themeSystem,
};
