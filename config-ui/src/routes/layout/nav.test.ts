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

import { describe, expect, it } from 'vitest';

// Load the routes barrel first so the config/routes import cycle resolves as it does in the app.
import '@/routes';

import { ACCESS_ROLE, type AccessCurrent } from '@/api/access';
import { LINKS, PATHS } from '@/config';
import { NAV_ITEM_KIND, type NavItem } from '@/ui';
import { findActiveKey, visibleItems } from '@/ui/sidebar-nav/utils';

import { NAV, NAV_DIVIDER_KEY } from './constants';
import { getNavItems } from './nav';

const ADMIN: AccessCurrent = { enabled: true, role: ACCESS_ROLE.CUSTOMER_ADMIN };
const MEMBER: AccessCurrent = { enabled: true, role: ACCESS_ROLE.MEMBER };

const SETTINGS_CHILD_KEYS: string[] = [NAV.USERS.key, NAV.AUTHENTICATION.key, NAV.ACTIVITY.key];

const flatten = (items: NavItem[]): NavItem[] =>
  items.flatMap((item) =>
    item.kind === NAV_ITEM_KIND.ROUTE && item.children ? [item, ...flatten(item.children)] : [item],
  );

const visibleKeys = (access: AccessCurrent | null, copyrightHide = false) =>
  flatten(visibleItems(getNavItems({ access, copyrightHide }))).map((item) => item.key);

const activeKey = (pathname: string, access: AccessCurrent | null = ADMIN) =>
  findActiveKey(visibleItems(getNavItems({ access, copyrightHide: false })), pathname);

describe('getNavItems', () => {
  it('orders the sidebar as Projects, Connections, Advanced, API Keys, Email History, Settings, Resources, divider, Dashboards', () => {
    const top = visibleItems(getNavItems({ access: ADMIN, copyrightHide: false })).map((item) => item.key);
    expect(top).toEqual([
      NAV.PROJECTS.key,
      NAV.CONNECTIONS.key,
      NAV.ADVANCED.key,
      NAV.API_KEYS.key,
      NAV.EMAIL_HISTORY.key,
      NAV.SETTINGS.key,
      NAV.RESOURCES.key,
      NAV_DIVIDER_KEY,
      NAV.DASHBOARDS.key,
    ]);
  });

  it('nests Blueprints and Pipelines under Advanced, and the four resource links under Resources', () => {
    const items = getNavItems({ access: ADMIN, copyrightHide: false });
    const childKeys = (key: string) => {
      const group = items.find((item) => item.key === key);
      return group?.kind === NAV_ITEM_KIND.ROUTE ? group.children?.map((child) => child.key) : undefined;
    };
    expect(childKeys(NAV.ADVANCED.key)).toEqual([NAV.BLUEPRINTS.key, NAV.PIPELINES.key]);
    expect(childKeys(NAV.RESOURCES.key)).toEqual([NAV.DOCS.key, NAV.API.key, NAV.GITHUB.key, NAV.SLACK.key]);
  });

  it('shows Settings and Users only to a customer administrator', () => {
    expect(visibleKeys(ADMIN)).toEqual(expect.arrayContaining([NAV.SETTINGS.key, NAV.USERS.key]));
    [MEMBER, { enabled: false }, null].forEach((access) => {
      const keys = visibleKeys(access);
      expect(keys).not.toContain(NAV.SETTINGS.key);
      expect(keys).not.toContain(NAV.USERS.key);
      expect(keys).toContain(NAV.PROJECTS.key);
    });
  });

  it('shows API Keys to an administrator and when access is disabled, but not to a member or a failed lookup', () => {
    [ADMIN, { enabled: false }].forEach((access) => expect(visibleKeys(access)).toContain(NAV.API_KEYS.key));
    [MEMBER, null].forEach((access) => expect(visibleKeys(access)).not.toContain(NAV.API_KEYS.key));
  });

  it('shows Email History to an administrator and when access is disabled, but not to a member or a failed lookup', () => {
    [ADMIN, { enabled: false }].forEach((access) => expect(visibleKeys(access)).toContain(NAV.EMAIL_HISTORY.key));
    [MEMBER, null].forEach((access) => expect(visibleKeys(access)).not.toContain(NAV.EMAIL_HISTORY.key));
  });

  it('lists Users, Authentication and Recent Activities under Settings, in that order', () => {
    const items = getNavItems({ access: ADMIN, copyrightHide: false });
    const settings = items.find((item) => item.key === NAV.SETTINGS.key);
    expect(settings?.kind === NAV_ITEM_KIND.ROUTE && settings.children?.map((child) => child.key)).toEqual([
      NAV.USERS.key,
      NAV.AUTHENTICATION.key,
      NAV.ACTIVITY.key,
    ]);
    const children = flatten(items).filter((item) => SETTINGS_CHILD_KEYS.includes(item.key));
    expect(children.map((item) => (item.kind === NAV_ITEM_KIND.ROUTE ? item.label : ''))).toEqual([
      NAV.USERS.label,
      NAV.AUTHENTICATION.label,
      NAV.ACTIVITY.label,
    ]);
  });

  it('shows Authentication and Recent Activities only to a customer administrator', () => {
    expect(visibleKeys(ADMIN)).toEqual(expect.arrayContaining([NAV.AUTHENTICATION.key, NAV.ACTIVITY.key]));
    [MEMBER, { enabled: false }, null].forEach((access) => {
      const keys = visibleKeys(access);
      expect(keys).not.toContain(NAV.AUTHENTICATION.key);
      expect(keys).not.toContain(NAV.ACTIVITY.key);
    });
  });

  it('opens the new Settings pages from their paths', () => {
    expect(activeKey(PATHS.SETTINGS_AUTHENTICATION())).toBe(NAV.AUTHENTICATION.key);
    expect(activeKey(PATHS.SETTINGS_ACTIVITY())).toBe(NAV.ACTIVITY.key);
  });

  it('hides Dashboards, GitHub and Slack, and the divider before them, when the copyright is hidden', () => {
    const keys = visibleKeys(ADMIN, true);
    [NAV.DASHBOARDS.key, NAV.GITHUB.key, NAV.SLACK.key, NAV_DIVIDER_KEY].forEach((key) =>
      expect(keys).not.toContain(key),
    );
    expect(keys).toEqual(expect.arrayContaining([NAV.DOCS.key, NAV.API.key, NAV.RESOURCES.key]));
  });

  it('uses the configured links, opens external items by href and labels from NAV', () => {
    const external = flatten(getNavItems({ access: ADMIN, copyrightHide: false })).filter(
      (item) => item.kind === NAV_ITEM_KIND.EXTERNAL,
    );
    expect(external.map((item) => (item.kind === NAV_ITEM_KIND.EXTERNAL ? item.href : ''))).toEqual([
      LINKS.DOCS,
      LINKS.API,
      LINKS.GITHUB,
      LINKS.SLACK,
      PATHS.DASHBOARDS(),
    ]);
    expect(external.map((item) => (item.kind === NAV_ITEM_KIND.EXTERNAL ? item.label : ''))).toEqual([
      NAV.DOCS.label,
      NAV.API.label,
      NAV.GITHUB.label,
      NAV.SLACK.label,
      NAV.DASHBOARDS.label,
    ]);
  });
});

describe('active item', () => {
  it.each([
    [PATHS.PROJECTS(), NAV.PROJECTS.key],
    [PATHS.PROJECT_TAB('my project', 'webhooks'), NAV.PROJECTS.key],
    [PATHS.PROJECT_BLUEPRINT_CONNECTION('x', 'github-1'), NAV.PROJECTS.key],
    [PATHS.CONNECTIONS(), NAV.CONNECTIONS.key],
    [PATHS.CONNECTION('github', 1), NAV.CONNECTIONS.key],
    [PATHS.OTEL(), NAV.CONNECTIONS.key],
    [PATHS.BLUEPRINTS(), NAV.BLUEPRINTS.key],
    [PATHS.BLUEPRINT(3), NAV.BLUEPRINTS.key],
    [PATHS.BLUEPRINT_CONNECTION(3, 'github', 1), NAV.BLUEPRINTS.key],
    [PATHS.PIPELINES(), NAV.PIPELINES.key],
    [PATHS.PIPELINE(3), NAV.PIPELINES.key],
    [PATHS.APIKEYS(), NAV.API_KEYS.key],
    [PATHS.SETTINGS_USERS(), NAV.USERS.key],
    [PATHS.SETTINGS_GRAFANA_USERS(), NAV.USERS.key],
  ])('highlights the right item for %s', (pathname, key) => {
    expect(activeKey(pathname)).toBe(key);
  });

  it('highlights nothing for a path outside the sidebar, or Users when Settings is hidden', () => {
    expect(activeKey(PATHS.DB_MIGRATE())).toBeUndefined();
    expect(activeKey(PATHS.SETTINGS_USERS(), MEMBER)).toBeUndefined();
  });

  it('does not treat a longer sibling name as a nested path', () => {
    expect(activeKey('/projectsx')).toBeUndefined();
  });
});
