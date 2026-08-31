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

import { request } from '@/utils';

export const ACCESS_ROLE = {
  CUSTOMER_ADMIN: 'customer_admin',
  MEMBER: 'member',
} as const;

export type AccessRole = (typeof ACCESS_ROLE)[keyof typeof ACCESS_ROLE];

export const ACCESS_STATUS = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
} as const;

export type AccessStatus = (typeof ACCESS_STATUS)[keyof typeof ACCESS_STATUS];

export const ACCESS_ERROR_CODE = {
  DUPLICATE_USER: 'DUPLICATE_USER',
  DUPLICATE_DOMAIN: 'DUPLICATE_DOMAIN',
  INVALID_USER: 'INVALID_USER',
  INVALID_DOMAIN: 'INVALID_DOMAIN',
  INVALID_OIDC_PROVIDER: 'INVALID_OIDC_PROVIDER',
  OIDC_PROVIDER_BLOCKED: 'OIDC_PROVIDER_BLOCKED',
  OIDC_PROVIDER_MISSING: 'OIDC_PROVIDER_MISSING',
} as const;

export type AccessErrorCode = (typeof ACCESS_ERROR_CODE)[keyof typeof ACCESS_ERROR_CODE];

export type AccessApiErrorResponse = {
  success: false;
  message?: string;
  code?: AccessErrorCode | string;
};

export type AccessCurrent = {
  enabled: boolean;
  role?: AccessRole;
};

export type AccessUser = {
  id: ID;
  issuer: string;
  subject: string;
  email: string;
  displayName: string;
  role: AccessRole;
  status: AccessStatus;
  lastLoginAt?: string;
  disabledAt?: string;
};

export type AccessDomain = {
  id: ID;
  domain: string;
  defaultRole: AccessRole;
  status: AccessStatus;
};

export type AccessAuditEvent = {
  id: ID;
  actorEmail: string;
  action: string;
  targetEmail: string;
  detail: string;
  createdAt: string;
};

export const OIDC_PROVIDER_SYNC_STATUS = {
  PENDING: 'pending',
  SYNCHRONIZED: 'synchronized',
  FAILED: 'failed',
  COMPENSATION_FAILED: 'compensation_failed',
} as const;

export type OIDCProviderSyncStatus = (typeof OIDC_PROVIDER_SYNC_STATUS)[keyof typeof OIDC_PROVIDER_SYNC_STATUS];

export type OIDCProviderInput = {
  providerKey: string;
  displayName: string;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
};

export type OIDCProvider = Omit<OIDCProviderInput, 'clientSecret'> & {
  enabled: boolean;
  secretConfigured: boolean;
  databaseSourceActive: boolean;
  grafanaSyncStatus: OIDCProviderSyncStatus;
  grafanaSyncedRevision: number;
  providerRevision: number;
  devlakeCallbackUrl: string;
  grafanaCallbackUrl: string;
};

export type AccessPagination = {
  page: number;
  pageSize: 10 | 25 | 50;
};

export type PaginatedAccessUsers = {
  users: AccessUser[];
  count: number;
  page: number;
  pageSize: number;
};

export type PaginatedAccessDomains = {
  domains: AccessDomain[];
  count: number;
  page: number;
  pageSize: number;
};

const basePath = '/access';

export const current = (): Promise<AccessCurrent> => request(`${basePath}/me`);
export const listUsers = (params: AccessPagination): Promise<PaginatedAccessUsers> =>
  request(`${basePath}/users`, { data: params });
export const createUser = (data: { email: string; role: AccessRole }): Promise<AccessUser> =>
  request(`${basePath}/users`, { method: 'POST', data });
export const updateUser = (id: ID, data: { role: AccessRole; status: AccessStatus }): Promise<AccessUser> =>
  request(`${basePath}/users/${id}`, { method: 'PATCH', data });
export const hideUser = (id: ID): Promise<AccessUser> => request(`${basePath}/users/${id}/hide`, { method: 'POST' });
export const listDomains = (params: AccessPagination): Promise<PaginatedAccessDomains> =>
  request(`${basePath}/domains`, { data: params });
export const createDomain = (data: { domain: string; defaultRole: AccessRole }): Promise<AccessDomain> =>
  request(`${basePath}/domains`, { method: 'POST', data });
export const updateDomain = (id: ID, data: { defaultRole: AccessRole; status: AccessStatus }): Promise<AccessDomain> =>
  request(`${basePath}/domains/${id}`, { method: 'PATCH', data });
export const hideDomain = (id: ID): Promise<AccessDomain> =>
  request(`${basePath}/domains/${id}/hide`, { method: 'POST' });
export const listAuditEvents = (): Promise<AccessAuditEvent[]> => request(`${basePath}/audit-events`);
export const getOIDCProvider = (): Promise<OIDCProvider> => request(`${basePath}/oidc-provider`);
export const validateOIDCProvider = (data: OIDCProviderInput): Promise<void> =>
  request(`${basePath}/oidc-provider/validate`, { method: 'POST', data });
export const saveOIDCProvider = (data: OIDCProviderInput): Promise<OIDCProvider> =>
  request(`${basePath}/oidc-provider`, { method: 'PUT', data });
export const activateOIDCProvider = (): Promise<OIDCProvider> =>
  request(`${basePath}/oidc-provider/activate`, { method: 'POST' });
export const retryGrafanaOIDCProviderSync = (): Promise<OIDCProvider> =>
  request(`${basePath}/oidc-provider/grafana/retry`, { method: 'POST' });
