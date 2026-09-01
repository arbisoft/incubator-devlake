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

import { ACCESS_ROLE, type AccessRole } from '@/api/access';

export const PATH_PREFIX = import.meta.env.DEVLAKE_PATH_PREFIX ?? '';
export const ACCESS_PATH = `${PATH_PREFIX}/access`;
export const BREADCRUMBS = [{ name: 'User Management', path: ACCESS_PATH }];
export const PAGE_DESCRIPTION =
  'Manage who can access DevLake. Grafana access remains independently managed in Grafana.';
export const PAGE_SIZE_OPTIONS: Array<10 | 25 | 50> = [10, 25, 50];
export const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

export const ACCESS_STATUS_COLOR = {
  active: 'green',
  disabled: 'default',
} as const;

export const OIDC_PROVIDER_STATUS = {
  ENVIRONMENT: 'Environment-managed',
  CONFIGURED: 'Configured, not active',
  ACTIVE: 'Active',
  PENDING: 'Changes awaiting activation',
  SYNCHRONIZING: 'Synchronizing Grafana',
  FAILED: 'Grafana synchronization failed',
  RECOVERY: 'Grafana recovery required',
} as const;

export const OIDC_PROVIDER_MESSAGE = {
  GRAFANA_SYNCHRONIZED: 'Grafana OAuth configuration synchronized.',
  CALLBACK_DESCRIPTION: 'Register this exact callback URL with the customer OIDC provider.',
  DEPLOYMENT_MANAGED:
    'DevLake is using deployment-managed OIDC settings until you validate and activate a database provider.',
  SECRET_REPLACEMENT_REQUIRED: 'Required only when changing the client ID or rotating the secret.',
  VALIDATED: 'OIDC provider settings are valid.',
  ACTIVATE_TITLE: 'Activate database OIDC settings?',
  ACTIVATE_DESCRIPTION: 'DevLake will stop using the deployment OIDC provider after this succeeds.',
  RECOVERY_REQUIRED:
    'Grafana OAuth was disabled because the new configuration could not be safely rolled back. Retry synchronization after resolving the deployment issue.',
} as const;

export const OIDC_PROVIDER_STATUS_COLOR: Record<string, string> = {
  [OIDC_PROVIDER_STATUS.ACTIVE]: 'green',
  [OIDC_PROVIDER_STATUS.FAILED]: 'red',
  [OIDC_PROVIDER_STATUS.RECOVERY]: 'red',
  [OIDC_PROVIDER_STATUS.CONFIGURED]: 'orange',
  [OIDC_PROVIDER_STATUS.PENDING]: 'orange',
};

export const ROLE_OPTIONS: Array<{ value: AccessRole; label: string }> = [
  { value: ACCESS_ROLE.MEMBER, label: 'Member' },
  { value: ACCESS_ROLE.CUSTOMER_ADMIN, label: 'Customer administrator' },
];
