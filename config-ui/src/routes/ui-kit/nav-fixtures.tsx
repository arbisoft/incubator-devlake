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
  BookOutlined,
  BuildOutlined,
  CodeOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  GithubOutlined,
  HistoryOutlined,
  KeyOutlined,
  LockOutlined,
  PartitionOutlined,
  ProjectOutlined,
  ReadOutlined,
  SettingOutlined,
  SlackOutlined,
  TeamOutlined,
} from '@ant-design/icons';

import { PATHS } from '@/config';
import { NAV_ITEM_KIND, type NavItem } from '@/ui';

import { COPY } from './constants';

const { sidebarNav: text } = COPY;
const route = (name: string) => `${PATHS.UI_KIT()}/${name}`;

export const NAV_ITEMS: NavItem[] = [
  {
    kind: NAV_ITEM_KIND.ROUTE,
    key: 'projects',
    label: text.projects,
    icon: <ProjectOutlined />,
    path: route('projects'),
  },
  {
    kind: NAV_ITEM_KIND.ROUTE,
    key: 'connections',
    label: text.connections,
    icon: <ApiOutlined />,
    path: route('connections'),
  },
  {
    kind: NAV_ITEM_KIND.ROUTE,
    key: 'advanced',
    label: text.advanced,
    icon: <ExperimentOutlined />,
    path: route('advanced'),
    children: [
      {
        kind: NAV_ITEM_KIND.ROUTE,
        key: 'blueprints',
        label: text.blueprints,
        icon: <BuildOutlined />,
        path: route('advanced/blueprints'),
      },
      {
        kind: NAV_ITEM_KIND.ROUTE,
        key: 'pipelines',
        label: text.pipelines,
        icon: <PartitionOutlined />,
        path: route('advanced/pipelines'),
      },
    ],
  },
  { kind: NAV_ITEM_KIND.ROUTE, key: 'keys', label: text.apiKeys, icon: <KeyOutlined />, path: route('keys') },
  {
    kind: NAV_ITEM_KIND.ROUTE,
    key: 'hidden',
    label: text.hidden,
    icon: <BookOutlined />,
    path: route('hidden'),
    visible: false,
  },
  {
    kind: NAV_ITEM_KIND.ROUTE,
    key: 'settings',
    label: text.settings,
    icon: <SettingOutlined />,
    path: route('settings'),
    children: [
      {
        kind: NAV_ITEM_KIND.ROUTE,
        key: 'users',
        label: text.users,
        icon: <TeamOutlined />,
        path: route('settings/users'),
      },
      {
        kind: NAV_ITEM_KIND.ROUTE,
        key: 'authentication',
        label: text.authentication,
        icon: <LockOutlined />,
        path: route('settings/authentication'),
      },
      {
        kind: NAV_ITEM_KIND.ROUTE,
        key: 'activities',
        label: text.activities,
        icon: <HistoryOutlined />,
        path: route('settings/activities'),
      },
    ],
  },
  {
    kind: NAV_ITEM_KIND.ROUTE,
    key: 'resources',
    label: text.resources,
    icon: <ReadOutlined />,
    path: route('resources'),
    children: [
      {
        kind: NAV_ITEM_KIND.EXTERNAL,
        key: 'docs',
        label: text.docs,
        icon: <BookOutlined />,
        href: 'https://devlake.apache.org/docs/Overview',
      },
      {
        kind: NAV_ITEM_KIND.EXTERNAL,
        key: 'api',
        label: text.api,
        icon: <CodeOutlined />,
        href: 'https://devlake.apache.org/docs/Overview',
      },
      {
        kind: NAV_ITEM_KIND.EXTERNAL,
        key: 'github',
        label: text.github,
        icon: <GithubOutlined />,
        href: 'https://github.com/apache/incubator-devlake',
      },
      {
        kind: NAV_ITEM_KIND.EXTERNAL,
        key: 'slack',
        label: text.slack,
        icon: <SlackOutlined />,
        href: 'https://devlake.apache.org/community',
      },
    ],
  },
  { kind: NAV_ITEM_KIND.DIVIDER, key: 'divider' },
  {
    kind: NAV_ITEM_KIND.EXTERNAL,
    key: 'dashboards',
    label: text.dashboards,
    icon: <DashboardOutlined />,
    href: 'https://grafana.example.com',
  },
];

export const LONG_NAV_ITEMS: NavItem[] = [
  { kind: NAV_ITEM_KIND.ROUTE, key: 'long', label: text.longLabel, icon: <ApiOutlined />, path: route('long') },
];
