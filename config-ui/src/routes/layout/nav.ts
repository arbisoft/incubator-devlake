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

import { createElement } from 'react';

import { LINKS, PATHS } from '@/config';
import { canManageAccess, canManageAdminFeatures } from '@/routes/settings/guard';
import { NAV_ITEM_KIND, type NavItem } from '@/ui';

import { NAV, NAV_DIVIDER_KEY, NAV_GATE } from './constants';
import type { NavMeta, NavVisibility } from './types';

const isVisible = ({ gate }: NavMeta, { access, copyrightHide }: NavVisibility) => {
  switch (gate) {
    case NAV_GATE.ACCESS:
      return canManageAccess(access);
    case NAV_GATE.ADMIN:
      return canManageAdminFeatures(access);
    case NAV_GATE.COPYRIGHT:
      return !copyrightHide;
    default:
      return true;
  }
};

export const getNavItems = (visibility: NavVisibility): NavItem[] => {
  const meta = (item: NavMeta) => {
    const { key, label, icon } = item;
    return { key, label, icon: createElement(icon), visible: isVisible(item, visibility) };
  };
  const route = (item: NavMeta, path: string, more: { matchPaths?: string[]; children?: NavItem[] } = {}): NavItem => ({
    kind: NAV_ITEM_KIND.ROUTE,
    ...meta(item),
    path,
    ...more,
  });
  const external = (item: NavMeta, href: string): NavItem => ({ kind: NAV_ITEM_KIND.EXTERNAL, ...meta(item), href });

  return [
    route(NAV.PROJECTS, PATHS.PROJECTS()),
    route(NAV.CONNECTIONS, PATHS.CONNECTIONS(), { matchPaths: [PATHS.OTEL()] }),
    route(NAV.ADVANCED, PATHS.BLUEPRINTS(), {
      children: [
        route(NAV.BLUEPRINTS, PATHS.BLUEPRINTS()),
        // The empty id leaves a trailing slash, so any pipeline id matches by prefix.
        route(NAV.PIPELINES, PATHS.PIPELINES(), { matchPaths: [PATHS.PIPELINE('')] }),
      ],
    }),
    route(NAV.API_KEYS, PATHS.APIKEYS()),
    route(NAV.EMAIL_HISTORY, PATHS.EMAIL_HISTORY()),
    route(NAV.SETTINGS, PATHS.SETTINGS_USERS(), {
      children: [
        route(NAV.USERS, PATHS.SETTINGS_USERS()),
        route(NAV.AUTHENTICATION, PATHS.SETTINGS_AUTHENTICATION()),
        route(NAV.ACTIVITY, PATHS.SETTINGS_ACTIVITY()),
      ],
    }),
    route(NAV.RESOURCES, PATHS.ROOT(), {
      children: [
        external(NAV.DOCS, LINKS.DOCS),
        external(NAV.API, LINKS.API),
        external(NAV.GITHUB, LINKS.GITHUB),
        external(NAV.SLACK, LINKS.SLACK),
      ],
    }),
    { kind: NAV_ITEM_KIND.DIVIDER, key: NAV_DIVIDER_KEY },
    external(NAV.DASHBOARDS, PATHS.DASHBOARDS()),
  ];
};
