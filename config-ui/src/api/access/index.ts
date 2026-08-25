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
export const listDomains = (params: AccessPagination): Promise<PaginatedAccessDomains> =>
  request(`${basePath}/domains`, { data: params });
export const createDomain = (data: { domain: string; defaultRole: AccessRole }): Promise<AccessDomain> =>
  request(`${basePath}/domains`, { method: 'POST', data });
export const updateDomain = (id: ID, data: { defaultRole: AccessRole; status: AccessStatus }): Promise<AccessDomain> =>
  request(`${basePath}/domains/${id}`, { method: 'PATCH', data });
export const listAuditEvents = (): Promise<AccessAuditEvent[]> => request(`${basePath}/audit-events`);
