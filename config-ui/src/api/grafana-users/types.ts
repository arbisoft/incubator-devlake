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

import type { GRAFANA_ERROR_CODE, GRAFANA_ROLE } from './constants';

export type GrafanaRole = (typeof GRAFANA_ROLE)[keyof typeof GRAFANA_ROLE];
export type GrafanaErrorCode = (typeof GRAFANA_ERROR_CODE)[keyof typeof GRAFANA_ERROR_CODE];

export type GrafanaStatus = {
  available: boolean;
  code?: GrafanaErrorCode | string;
};

export type GrafanaUser = {
  id: ID;
  email: string;
  name: string;
  role: GrafanaRole | string;
  disabled: boolean;
  sso: boolean;
  lastSeenAt?: string;
  protected: boolean;
  projects: string[];
};

export type GrafanaOrphan = {
  account: string;
  projects: string[];
};

export type GrafanaUserList = {
  users: GrafanaUser[];
  count: number;
  page: number;
  pageSize: number;
  orphans: GrafanaOrphan[];
};

export type GrafanaUserListParams = {
  query?: string;
  page: number;
  pageSize: number;
};

export type GrafanaCreateUserBody = {
  email: string;
  name: string;
  role: GrafanaRole;
  projectNames: string[];
  password: string;
};

export type GrafanaPatchUserBody = {
  name?: string;
  email?: string;
  role?: GrafanaRole;
  disabled?: boolean;
};
