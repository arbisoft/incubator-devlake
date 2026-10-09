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

import { ACCESS_STATUS, type AccessStatus } from '@/api/access/constants';
import { GRAFANA_ERROR_CODE } from '@/api/grafana-users/constants';
import type { GrafanaErrorCode } from '@/api/grafana-users/types';

export const MAX_VISIBLE_PROJECTS = 5;

export const GRAFANA_USER_COLUMN = {
  USER: 'user',
  ROLE: 'role',
  PROJECTS: 'projects',
  STATUS: 'status',
} as const;

const ERROR_COPY: Record<GrafanaErrorCode, string> = {
  [GRAFANA_ERROR_CODE.NOT_CONFIGURED]:
    "Grafana user management isn't set up on this DevLake. Ask your operator to configure the Grafana management account.",
  [GRAFANA_ERROR_CODE.UNAVAILABLE]: "DevLake can't reach Grafana right now. Try again in a moment.",
  [GRAFANA_ERROR_CODE.NOT_SERVER_ADMIN]:
    "DevLake's Grafana management account no longer has server admin rights. Ask your operator to restore them.",
  [GRAFANA_ERROR_CODE.USER_EXISTS]: 'A Grafana account with this email already exists.',
  [GRAFANA_ERROR_CODE.USER_NOT_FOUND]: 'This user no longer exists in Grafana. The list has been refreshed.',
  [GRAFANA_ERROR_CODE.USER_PROTECTED]:
    'This is a Grafana server administrator. Only their projects can be changed here.',
  [GRAFANA_ERROR_CODE.USER_SSO_MANAGED]:
    'This account signs in with SSO, so its name, email and password are managed by the identity provider.',
  [GRAFANA_ERROR_CODE.LAST_ADMIN]: 'This is the last Grafana admin. Make someone else an Admin first.',
  [GRAFANA_ERROR_CODE.PASSWORD_TOO_SHORT]: 'The password must be at least 15 characters.',
  [GRAFANA_ERROR_CODE.PASSWORD_REJECTED]: 'Grafana rejected this password. Try a longer or more varied one.',
  [GRAFANA_ERROR_CODE.PROJECT_NOT_FOUND]: 'One of the selected projects no longer exists. Refresh and try again.',
  [GRAFANA_ERROR_CODE.PARTIAL]: "The account was created, but its role or projects weren't saved. Retry to finish.",
};

export const GRAFANA_ERROR_MAP: Record<string, string> = { ...ERROR_COPY };

export const COPY = {
  title: 'Grafana Users',
  searchPlaceholder: 'Search users',
  tableLabel: 'Grafana users',
  columns: { user: 'User', role: 'Role', projects: 'Projects', status: 'Status' },
  status: {
    [ACCESS_STATUS.ACTIVE]: 'Active',
    [ACCESS_STATUS.DISABLED]: 'Disabled',
  } as Record<AccessStatus, string>,
  sso: { tag: 'SSO', label: 'Signed in with SSO' },
  moreProjects: (count: number) => `+${count}`,
  empty: {
    title: 'No Grafana users yet',
    description: 'Grafana accounts will appear here once they exist.',
  },
  noResults: {
    title: 'No Grafana users match your search',
    description: 'Try a different email or name.',
  },
  orphans: {
    notice: (count: number) =>
      count === 1
        ? '1 saved dashboard mapping belongs to an account that no longer exists in Grafana.'
        : `${count} saved dashboard mappings belong to accounts that no longer exist in Grafana.`,
  },
  unavailable: { title: 'Grafana users are unavailable' },
  errors: ERROR_COPY,
};
