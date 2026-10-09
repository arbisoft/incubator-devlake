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

import { HttpStatusCode } from 'axios';

import {
  ACCESS_ERROR_CODE,
  ACCESS_ROLE,
  ACCESS_STATUS,
  type AccessRole,
  type AccessStatus,
} from '@/api/access/constants';
import { CONFIRM_TONE } from '@/ui/confirm-modal/constants';
import { STATUS_TONE } from '@/ui/constants';
import type { ConfirmConfig } from '@/ui/types';

export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
export const [DEFAULT_PAGE_SIZE] = PAGE_SIZE_OPTIONS;

export const LIFECYCLE_SUBJECT = { USER: 'user', DOMAIN: 'domain' } as const;

export const LIFECYCLE_ACTION = {
  ENABLE: 'enable',
  DISABLE: 'disable',
  HIDE: 'hide',
  RESET_PASSWORD: 'reset-password',
  REMOVE_PASSWORD: 'remove-password',
} as const;

export const ACCESS_MODAL = {
  USER: 'user',
  LOCAL_USER: 'local-user',
  LOCAL_CREDENTIAL: 'local-credential',
  DOMAIN: 'domain',
} as const;

export const USER_COLUMN = {
  USER: 'user',
  ROLE: 'role',
  STATUS: 'status',
  LOCAL_PASSWORD: 'localPassword',
  ACTIONS: 'actions',
} as const;

export const USER_FILTER = { STATUS: 'status' } as const;

export const DOMAIN_COLUMN = { DOMAIN: 'domain', ROLE: 'defaultRole', STATUS: 'status', ACTIONS: 'actions' } as const;

export const ACCESS_STATUS_TONE = {
  [ACCESS_STATUS.ACTIVE]: STATUS_TONE.SUCCESS,
  [ACCESS_STATUS.DISABLED]: STATUS_TONE.NEUTRAL,
} as const satisfies Record<AccessStatus, string>;

export const ROLE_LABEL = {
  [ACCESS_ROLE.MEMBER]: 'Member',
  [ACCESS_ROLE.CUSTOMER_ADMIN]: 'Customer administrator',
} as const satisfies Record<AccessRole, string>;

export const ROLE_OPTIONS: Array<{ value: AccessRole; label: string }> = [
  { value: ACCESS_ROLE.MEMBER, label: ROLE_LABEL[ACCESS_ROLE.MEMBER] },
  { value: ACCESS_ROLE.CUSTOMER_ADMIN, label: ROLE_LABEL[ACCESS_ROLE.CUSTOMER_ADMIN] },
];

export const ACCESS_ERROR = {
  DUPLICATE_DOMAIN: 'This domain already has a DevLake access policy.',
  DUPLICATE_USER: 'This email already has a DevLake access entry.',
  INVALID_DOMAIN: 'Enter a valid email domain and role, then try again.',
  INVALID_USER: 'Enter a valid email and role, then try again.',
  LOCAL_CREDENTIAL_MISSING: 'This person does not have a local password.',
  LAST_LOGIN_METHOD: 'Keep at least one interactive login method enabled.',
  REQUEST_FAILED: 'Unable to update access settings. Please try again.',
  INVALID_OIDC_PROVIDER: 'Enter valid OIDC provider settings and include the openid scope.',
  OIDC_PROVIDER_BLOCKED: 'OIDC provider settings cannot be applied until the deployment prerequisites are available.',
  OIDC_PROVIDER_FAILED: 'OIDC provider settings could not be completed. Please try again.',
  OIDC_PROVIDER_STALE: 'This provider changed. Refresh the page before saving it.',
  GRAFANA_TARGET_CONFLICT: 'Another provider already controls this Grafana sign-in option.',
  GRAFANA_SYNC_FAILED:
    'OIDC provider was saved, but Grafana OAuth synchronization failed. Use Retry Grafana to complete synchronization.',
  LOCAL_DUPLICATE_USER: 'This username already has a DevLake local password.',
  LOCAL_INVALID_USER: 'Enter a valid username, then try again.',
  INVALID_UPDATE: 'Choose a valid role and status, then try again.',
  LAST_ADMIN: 'Keep at least one active customer administrator.',
  ENTRY_NOT_FOUND: 'This entry no longer exists. Refresh the page and try again.',
} as const;

export const CREATE_USER_ERROR_MAP: Record<string, string> = {
  [ACCESS_ERROR_CODE.DUPLICATE_USER]: ACCESS_ERROR.DUPLICATE_USER,
  [ACCESS_ERROR_CODE.INVALID_USER]: ACCESS_ERROR.INVALID_USER,
  [ACCESS_ERROR_CODE.LOCAL_CREDENTIAL_MISSING]: ACCESS_ERROR.LOCAL_CREDENTIAL_MISSING,
  [ACCESS_ERROR_CODE.LAST_LOGIN_METHOD]: ACCESS_ERROR.LAST_LOGIN_METHOD,
};

export const LOCAL_CREDENTIAL_ERROR_MAP: Record<string, string> = {
  [ACCESS_ERROR_CODE.LOCAL_CREDENTIAL_MISSING]: ACCESS_ERROR.LOCAL_CREDENTIAL_MISSING,
  [ACCESS_ERROR_CODE.LAST_LOGIN_METHOD]: ACCESS_ERROR.LAST_LOGIN_METHOD,
  [ACCESS_ERROR_CODE.DUPLICATE_USER]: ACCESS_ERROR.LOCAL_DUPLICATE_USER,
  [ACCESS_ERROR_CODE.INVALID_USER]: ACCESS_ERROR.LOCAL_INVALID_USER,
};

export const CREATE_DOMAIN_ERROR_MAP: Record<string, string> = {
  [ACCESS_ERROR_CODE.DUPLICATE_DOMAIN]: ACCESS_ERROR.DUPLICATE_DOMAIN,
  [ACCESS_ERROR_CODE.INVALID_DOMAIN]: ACCESS_ERROR.INVALID_DOMAIN,
};

export const UPDATE_ACCESS_ERROR_MAP: Record<string, string> = {
  [ACCESS_ERROR_CODE.INVALID_USER]: ACCESS_ERROR.INVALID_UPDATE,
  [ACCESS_ERROR_CODE.INVALID_DOMAIN]: ACCESS_ERROR.INVALID_UPDATE,
  [HttpStatusCode.NotFound]: ACCESS_ERROR.ENTRY_NOT_FOUND,
};

export const LAST_ADMIN_SERVER_TEXT = 'keep at least one active customer administrator';
export const DUPLICATE_USER_SERVER_TEXT = 'this email already has a DevLake access entry';
export const DUPLICATE_DOMAIN_SERVER_TEXT = 'this domain already has a DevLake access policy';

export const COPY = {
  actions: { enable: 'Enable', disable: 'Disable' },
  users: {
    title: 'Users',
    description: 'Control who can sign in to DevLake. Grafana access is managed separately, in Grafana.',
    searchPlaceholder: 'Search users',
    tableLabel: 'Users',
    addUser: 'Add user',
    addLocalUser: 'Add local user',
    pendingFirstLogin: 'Pending first login',
    columns: {
      user: 'User',
      role: 'Role',
      status: 'Status',
      localPassword: 'Local password',
      actions: 'Actions',
    },
    status: {
      [ACCESS_STATUS.ACTIVE]: 'Active',
      [ACCESS_STATUS.DISABLED]: 'Inactive',
    } as Record<AccessStatus, string>,
    roleFor: (name: string) => `Role for ${name}`,
    enable: (name: string) => `Enable ${name}`,
    disable: (name: string) => `Disable ${name}`,
    remove: (name: string) => `Remove ${name}`,
    localPassword: {
      add: 'Add password',
      reset: 'Reset',
      remove: 'Remove',
      resetFor: (name: string) => `Reset local password for ${name}`,
      removeFor: (name: string) => `Remove local password for ${name}`,
    },
    empty: {
      title: 'No users yet',
      description: 'Add your first user to give them access to DevLake.',
    },
    noResults: {
      title: 'No users match your search or filter',
      description: 'Try a different email or name, or clear the status filter.',
    },
  },
  domains: {
    title: 'Allowed domains',
    description: 'Anyone with an email at these domains can sign in without an invite.',
    tableLabel: 'Allowed domains',
    addDomain: 'Add domain',
    columns: { domain: 'Domain', defaultRole: 'Default role', status: 'Status', actions: 'Actions' },
    status: {
      [ACCESS_STATUS.ACTIVE]: 'Active',
      [ACCESS_STATUS.DISABLED]: 'Disabled',
    } as Record<AccessStatus, string>,
    roleFor: (domain: string) => `Default role for ${domain}`,
    enable: (domain: string) => `Enable ${domain}`,
    disable: (domain: string) => `Disable ${domain}`,
    remove: (domain: string) => `Remove ${domain}`,
    empty: {
      title: 'No domains yet',
      description: 'Everyone must be invited individually.',
    },
  },
  modals: {
    addUser: {
      title: 'Add user',
      submit: 'Add',
      disabledReason: 'Enter a valid email address.',
      email: { label: 'Email', placeholder: 'person@example.com' },
      role: { label: 'Role' },
      invalidEmail: 'Enter a valid email address, such as person@example.com.',
      note: 'The person is authorized after their first verified sign-in with the configured OIDC provider.',
    },
    addDomain: {
      title: 'Add allowed domain',
      submit: 'Allow',
      disabledReason: 'Enter a valid email domain.',
      domain: { label: 'Domain', placeholder: 'example.com' },
      role: { label: 'Default role' },
      invalidDomain: 'Enter a valid email domain, such as example.com.',
      note: 'Anyone with a verified email at this domain becomes a DevLake user on first sign-in.',
    },
    addLocalUser: {
      title: 'Add local DevLake user',
      submit: 'Create',
      disabledReason: 'Enter a valid username.',
      name: { label: 'Name' },
      role: { label: 'Role' },
      note: 'DevLake generates a temporary password. The person must change it after their first sign-in.',
    },
    addLocalCredential: {
      title: 'Add local password',
      submit: 'Generate password',
      disabledReason: 'Enter a valid username.',
      note: 'DevLake generates a temporary password. The person must change it after their first sign-in.',
    },
    username: { label: 'Username', placeholder: 'person' },
    invalidLoginName: 'Use 3-64 letters, numbers, dots, underscores, or hyphens, starting with a letter or number.',
    temporaryPassword: {
      title: 'Temporary password',
      hint: 'Copy this password now. It is shown only once and must be changed after sign-in.',
      passwordFor: (loginName: string) => `Password for ${loginName}`,
      copy: 'Copy temporary password',
      done: 'Done',
    },
  },
  confirm: {
    resetPassword: {
      tone: CONFIRM_TONE.DEFAULT,
      title: () => 'Reset this local password?',
      description: (name: string) => `Existing DevLake sessions for ${name} will be signed out.`,
      confirm: 'Reset',
    },
    removePassword: {
      tone: CONFIRM_TONE.DANGER,
      title: () => 'Remove this local password?',
      description: (name: string) => `${name} can still use a linked OIDC provider, if one is available.`,
      confirm: 'Remove',
    },
    hideUser: {
      tone: CONFIRM_TONE.DANGER,
      title: () => 'Delete user?',
      description: (name: string) =>
        `Are you sure you want to delete ${name}? They will immediately lose access to this workspace. The record stays in the audit history.`,
      confirm: 'Delete user',
    },
    hideDomain: {
      tone: CONFIRM_TONE.DANGER,
      title: () => 'Remove this domain?',
      description: (domain: string) =>
        `This stops automatic provisioning for ${domain} only. Existing people keep their current access, and the record remains in audit history.`,
      confirm: 'Remove domain',
    },
  },
};

export const USER_STATUS_FILTER_OPTIONS = Object.values(ACCESS_STATUS).map((value) => ({
  value,
  text: COPY.users.status[value],
}));

export const LIFECYCLE_CONFIRM: Record<
  (typeof LIFECYCLE_SUBJECT)[keyof typeof LIFECYCLE_SUBJECT],
  Partial<Record<(typeof LIFECYCLE_ACTION)[keyof typeof LIFECYCLE_ACTION], ConfirmConfig>>
> = {
  [LIFECYCLE_SUBJECT.USER]: {
    [LIFECYCLE_ACTION.HIDE]: COPY.confirm.hideUser,
    [LIFECYCLE_ACTION.RESET_PASSWORD]: COPY.confirm.resetPassword,
    [LIFECYCLE_ACTION.REMOVE_PASSWORD]: COPY.confirm.removePassword,
  },
  [LIFECYCLE_SUBJECT.DOMAIN]: {
    [LIFECYCLE_ACTION.HIDE]: COPY.confirm.hideDomain,
  },
};
