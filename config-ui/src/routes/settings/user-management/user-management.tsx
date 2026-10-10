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

import { type ComponentType } from 'react';

import { PATHS, USER_MANAGEMENT_VIEW, type UserManagementView } from '@/config';
import { ListPage, PageHeader, ROUTE_TABS_VARIANT, RouteTabs } from '@/ui';
import { useRouteTab } from '@/ui/hooks';

import { GrafanaUsers } from '../grafana-users';
import { DevlakeUsers } from '../users';

import { COPY } from './constants';
import { getUserManagementViews, toUserManagementView } from './utils';

const VIEWS = getUserManagementViews();

const VIEW_BODY: Record<UserManagementView, ComponentType> = {
  [USER_MANAGEMENT_VIEW.DEVLAKE]: DevlakeUsers,
  [USER_MANAGEMENT_VIEW.GRAFANA]: GrafanaUsers,
};

export const SettingsUserManagement = () => {
  const view = toUserManagementView(useRouteTab(VIEWS));
  const Body = VIEW_BODY[view];

  return (
    <ListPage>
      <PageHeader
        title={COPY.title}
        description={COPY.descriptions[view]}
        breadcrumbs={[
          { label: COPY.breadcrumbSettings, path: PATHS.SETTINGS_USERS() },
          { label: COPY.title, path: PATHS.SETTINGS_USERS() },
          { label: COPY.breadcrumbViews[view] },
        ]}
        switcher={<RouteTabs items={VIEWS} variant={ROUTE_TABS_VARIANT.SEGMENTED} />}
      />
      <Body />
    </ListPage>
  );
};
