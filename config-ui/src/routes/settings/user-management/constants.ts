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

import { USER_MANAGEMENT_VIEW } from '@/config/route-keys';
import type { UserManagementView } from '@/config/types';

export const USER_MANAGEMENT_VIEW_ORDER: UserManagementView[] = [
  USER_MANAGEMENT_VIEW.DEVLAKE,
  USER_MANAGEMENT_VIEW.GRAFANA,
];

export const COPY = {
  title: 'User Management',
  breadcrumbSettings: 'Settings',
  views: {
    [USER_MANAGEMENT_VIEW.DEVLAKE]: 'DevLake',
    [USER_MANAGEMENT_VIEW.GRAFANA]: 'Grafana',
  } satisfies Record<UserManagementView, string>,
  breadcrumbViews: {
    [USER_MANAGEMENT_VIEW.DEVLAKE]: 'DevLake Users',
    [USER_MANAGEMENT_VIEW.GRAFANA]: 'Grafana Users',
  } satisfies Record<UserManagementView, string>,
  descriptions: {
    [USER_MANAGEMENT_VIEW.DEVLAKE]: 'Manage who can sign in to DevLake.',
    [USER_MANAGEMENT_VIEW.GRAFANA]: 'Control which project dashboards each person can open in Grafana.',
  } satisfies Record<UserManagementView, string>,
};
