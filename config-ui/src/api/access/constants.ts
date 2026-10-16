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

export const ACCESS_ROLE = {
  CUSTOMER_ADMIN: 'customer_admin',
  MEMBER: 'member',
} as const;

export const ACCESS_STATUS = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
} as const;

export const ACCESS_ERROR_CODE = {
  DUPLICATE_USER: 'DUPLICATE_USER',
  DUPLICATE_DOMAIN: 'DUPLICATE_DOMAIN',
  INVALID_USER: 'INVALID_USER',
  INVALID_DOMAIN: 'INVALID_DOMAIN',
  INVALID_OIDC_PROVIDER: 'INVALID_OIDC_PROVIDER',
  LOCAL_CREDENTIAL_MISSING: 'LOCAL_CREDENTIAL_MISSING',
  LAST_LOGIN_METHOD: 'LAST_LOGIN_METHOD',
  OIDC_PROVIDER_BLOCKED: 'OIDC_PROVIDER_BLOCKED',
  OIDC_PROVIDER_MISSING: 'OIDC_PROVIDER_MISSING',
  OIDC_PROVIDER_REVISION_CONFLICT: 'OIDC_PROVIDER_REVISION_CONFLICT',
  GRAFANA_TARGET_CONFLICT: 'GRAFANA_TARGET_CONFLICT',
  OIDC_IDENTITY_LINKED: 'OIDC_IDENTITY_LINKED',
  GRAFANA_SYNC_FAILED: 'GRAFANA_SYNC_FAILED',
} as const;

export const OIDC_PROVIDER_SYNC_STATUS = {
  PENDING: 'pending',
  SYNCHRONIZED: 'synchronized',
  FAILED: 'failed',
  COMPENSATED: 'compensated',
  COMPENSATION_FAILED: 'compensation_failed',
  NOT_APPLICABLE: 'not_applicable',
} as const;

export const GRAFANA_PROVIDER_KIND = {
  NONE: 'none',
  GOOGLE: 'google',
  AZURE_AD: 'azuread',
  OKTA: 'okta',
  GITLAB: 'gitlab',
  GENERIC_OAUTH: 'generic_oauth',
} as const;

export type AccessRole = (typeof ACCESS_ROLE)[keyof typeof ACCESS_ROLE];

export type AccessStatus = (typeof ACCESS_STATUS)[keyof typeof ACCESS_STATUS];

export type AccessErrorCode = (typeof ACCESS_ERROR_CODE)[keyof typeof ACCESS_ERROR_CODE];

export type OIDCProviderSyncStatus = (typeof OIDC_PROVIDER_SYNC_STATUS)[keyof typeof OIDC_PROVIDER_SYNC_STATUS];

export type GrafanaProviderKind = (typeof GRAFANA_PROVIDER_KIND)[keyof typeof GRAFANA_PROVIDER_KIND];
