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

export const GRAFANA_ROLE = {
  VIEWER: 'Viewer',
  EDITOR: 'Editor',
  ADMIN: 'Admin',
} as const;

export const GRAFANA_ERROR_CODE = {
  NOT_CONFIGURED: 'GRAFANA_NOT_CONFIGURED',
  UNAVAILABLE: 'GRAFANA_UNAVAILABLE',
  NOT_SERVER_ADMIN: 'GRAFANA_NOT_SERVER_ADMIN',
  USER_EXISTS: 'GRAFANA_USER_EXISTS',
  USER_NOT_FOUND: 'GRAFANA_USER_NOT_FOUND',
  USER_PROTECTED: 'GRAFANA_USER_PROTECTED',
  USER_SSO_MANAGED: 'GRAFANA_USER_SSO_MANAGED',
  LAST_ADMIN: 'GRAFANA_LAST_ADMIN',
  PASSWORD_TOO_SHORT: 'GRAFANA_PASSWORD_TOO_SHORT',
  PASSWORD_REJECTED: 'GRAFANA_PASSWORD_REJECTED',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  PARTIAL: 'GRAFANA_PARTIAL',
} as const;
