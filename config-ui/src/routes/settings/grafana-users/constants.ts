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
import { GRAFANA_ERROR_CODE, GRAFANA_ROLE } from '@/api/grafana-users/constants';
import type { GrafanaErrorCode } from '@/api/grafana-users/types';
import { CONFIRM_TONE } from '@/ui/confirm-modal/constants';
import type { ConfirmConfig } from '@/ui/types';

export const MAX_VISIBLE_PROJECTS = 5;

export const GRAFANA_USER_COLUMN = {
  USER: 'user',
  ROLE: 'role',
  PROJECTS: 'projects',
  STATUS: 'status',
  ACTIONS: 'actions',
} as const;

export const GRAFANA_DIALOG = {
  ADD: 'add',
  DETAILS: 'details',
  PROJECTS: 'projects',
  PASSWORD: 'password',
  ORPHANS: 'orphans',
} as const;

export const GRAFANA_ROW_ACTION = { ENABLE: 'enable', DISABLE: 'disable', DELETE: 'delete' } as const;

export const GRAFANA_MENU_ACTION = { DETAILS: 'details', PASSWORD: 'password' } as const;

export const PASSWORD_MIN_LENGTH = 15;
export const GENERATED_PASSWORD_LENGTH = 24;
// No 0, O, 1, l or I, so a shared password can be read aloud or typed from a screen.
export const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export const SEARCH_DEBOUNCE_MS = 300;
export const DEVLAKE_USER_SEARCH_PAGE_SIZE = 25;
export const PROJECT_SEARCH_PAGE_SIZE = 50;

const SET_PASSWORD_LABEL = 'Set password';

export const GRAFANA_ROLE_OPTIONS = Object.values(GRAFANA_ROLE).map((role) => ({ value: role, label: role }));

const withErrors = (overrides: Record<string, string>): Record<string, string> => ({
  ...ERROR_COPY,
  ...overrides,
});

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

export const GRAFANA_FLOW_ERRORS = {
  ROLE: withErrors({
    [GRAFANA_ERROR_CODE.USER_PROTECTED]: "The role of a Grafana server administrator can't be changed here.",
  }),
  STATUS: withErrors({
    [GRAFANA_ERROR_CODE.USER_PROTECTED]: "Grafana server administrators can't be disabled here.",
    [GRAFANA_ERROR_CODE.LAST_ADMIN]: 'This is the last Grafana admin. Make someone else an Admin first.',
  }),
  DELETE: withErrors({
    [GRAFANA_ERROR_CODE.USER_PROTECTED]: "Grafana server administrators can't be deleted here.",
    [GRAFANA_ERROR_CODE.LAST_ADMIN]: 'This is the last Grafana admin. Make someone else an Admin before deleting them.',
  }),
  DETAILS: withErrors({
    [GRAFANA_ERROR_CODE.USER_PROTECTED]:
      "This is a Grafana server administrator. Their name and email can't be changed here.",
    [GRAFANA_ERROR_CODE.USER_SSO_MANAGED]:
      'This account signs in with SSO, so its name and email are managed by the identity provider.',
  }),
  PASSWORD: withErrors({
    [GRAFANA_ERROR_CODE.USER_PROTECTED]: "This is a Grafana server administrator. Their password can't be set here.",
    [GRAFANA_ERROR_CODE.USER_SSO_MANAGED]:
      'This account signs in with SSO, so its password is managed by the identity provider.',
  }),
  CREATE: withErrors({}),
  PROJECTS: withErrors({}),
  ORPHAN: withErrors({}),
};

export const COPY = {
  title: 'Grafana Users',
  searchPlaceholder: 'Search users',
  tableLabel: 'Grafana users',
  columns: { user: 'User', role: 'Role', projects: 'Projects', status: 'Status', actions: 'Actions' },
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
  actions: {
    addUser: 'Add user',
    enable: 'Enable',
    disable: 'Disable',
    editDetails: 'Edit details',
    setPassword: SET_PASSWORD_LABEL,
    review: 'Review',
    close: 'Close',
    columnLabel: 'Actions',
    roleFor: (email: string) => `Role for ${email}`,
    roleLocked: 'Grafana server administrators keep their role.',
    editProjectsFor: (email: string) => `Edit projects for ${email}`,
    moreFor: (email: string) => `More actions for ${email}`,
    enableFor: (email: string) => `Enable ${email}`,
    disableFor: (email: string) => `Disable ${email}`,
    deleteFor: (email: string) => `Delete ${email}`,
  },
  password: {
    label: 'Password',
    rule: 'At least 15 characters.',
    generate: 'Generate',
    copy: 'Copy password',
    oneTime: {
      title: 'One-time password',
      hint: (email: string) => `Share this password with ${email}. It won't be shown again.`,
      passwordFor: (email: string) => `Password for ${email}`,
      copy: 'Copy password',
      done: 'Done',
    },
  },
  add: {
    title: 'Add Grafana user',
    submit: 'Add user',
    retry: 'Retry',
    disabledReason: 'Enter a valid email, a name and a password of at least 15 characters.',
    fillFrom: { label: 'Fill from DevLake user', placeholder: 'Search DevLake users', empty: 'No DevLake users found' },
    email: { label: 'Email', placeholder: 'person@company.com' },
    invalidEmail: 'Enter a valid email address.',
    name: { label: 'Name', placeholder: 'Full name' },
    role: { label: 'Role' },
    projects: { label: 'Projects' },
    partial: "The account was created, but its role or projects weren't saved.",
  },
  details: {
    title: 'Edit details',
    submit: 'Save',
    disabledReason: 'Enter a valid email and a name.',
    ssoNote: 'Managed by SSO.',
    confirm: {
      tone: CONFIRM_TONE.DEFAULT,
      title: () => 'Change this email?',
      description: (name: string, email: string) =>
        `${name} will sign in with ${email} from now on. Their project access moves with them.`,
      confirm: 'Change email',
    },
  },
  projects: {
    title: 'Edit projects',
    submit: 'Save',
    description: (email: string) => `Choose the projects ${email} can open in Grafana.`,
    label: 'Projects',
    placeholder: 'Search projects',
    empty: 'No projects found',
    emptyHint: "They won't see any project dashboards.",
  },
  setPassword: {
    title: SET_PASSWORD_LABEL,
    submit: SET_PASSWORD_LABEL,
    disabledReason: 'Enter a password of at least 15 characters.',
    description: (email: string) => `Choose a new password for ${email}.`,
  },
  confirm: {
    [GRAFANA_ROW_ACTION.ENABLE]: {
      tone: CONFIRM_TONE.DEFAULT,
      title: (email: string) => `Enable ${email}?`,
      description: (email: string) => `${email} will be able to sign in to Grafana again.`,
      confirm: 'Enable',
    },
    [GRAFANA_ROW_ACTION.DISABLE]: {
      tone: CONFIRM_TONE.DANGER,
      title: (email: string) => `Disable ${email}?`,
      description: (email: string) =>
        `${email} won't be able to sign in to Grafana until you enable the account again.`,
      confirm: 'Disable',
    },
    [GRAFANA_ROW_ACTION.DELETE]: {
      tone: CONFIRM_TONE.DANGER,
      title: (email: string) => `Delete ${email} from Grafana?`,
      description: () =>
        "This deletes their Grafana account and removes their access to every project dashboard. Their DevLake account isn't affected.",
      confirm: 'Delete user',
    },
  } satisfies Record<(typeof GRAFANA_ROW_ACTION)[keyof typeof GRAFANA_ROW_ACTION], ConfirmConfig>,
  orphansDialog: {
    title: 'Saved dashboard access without an account',
    description: 'These accounts no longer exist in Grafana. Clearing removes their saved project access.',
    clear: 'Clear',
    clearFor: (account: string) => `Clear saved access for ${account}`,
    close: 'Close',
    confirm: {
      tone: CONFIRM_TONE.DANGER,
      title: (account: string) => `Clear the saved dashboard access for ${account}?`,
      description: () => 'This removes the saved project access. No Grafana account is affected.',
      confirm: 'Clear access',
    },
  },
};
