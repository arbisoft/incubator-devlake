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

import { isEqual, isUndefined, omitBy, pick } from 'lodash';

import type { ICustomHeader } from '@/types';

import type { ConnectionFormValues } from './types';

// Fields tracked in connection-form component state. These are the fields a
// user can type into the form; values flow through React state as
// `setValues({ ...pick(connection, CONNECTION_FORM_FIELDS) })`.
export const CONNECTION_FORM_FIELDS = [
  'name',
  'endpoint',
  'authMethod',
  'authMode',
  'username',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'appId',
  'cloudId',
  'clientId',
  'secretKey',
  'clientSecret',
  'proxy',
  'dbUrl',
  'companyId',
  'organization',
  'organizationId',
  'org',
  'workspaceSlug',
  'loginUrl',
  'instanceUrl',
  'apiVersion',
  'rateLimitPerHour',
  'enableWebhook',
  'webhookSharedKey',
  'customHeaders',
];

// Plugin `initialValues` may include defaults that are NOT user-typed form
// fields but still need to flow to the save endpoint (e.g. AWS credentials in
// q-dev, GitHub App fields). When a new plugin adds an `initialValues` key
// outside CONNECTION_FORM_FIELDS, add it here or the default will be silently
// dropped from the save payload.
const PLUGIN_INITIAL_VALUE_FIELDS = [
  'authType',
  'accessKeyId',
  'secretAccessKey',
  'region',
  'bucket',
  'identityStoreId',
  'identityStoreRegion',
  'installationId',
  'enterprise',
  'workspaceId',
  'projectId',
  'portalId',
  'tenantId',
  'tenantType',
  'usesApiToken',
];

const SAVE_CONNECTION_FIELDS = [...CONNECTION_FORM_FIELDS, ...PLUGIN_INITIAL_VALUE_FIELDS];

export const buildConnectionSavePayload = (
  initialValues: ConnectionFormValues | undefined,
  values: ConnectionFormValues,
): ConnectionFormValues => pick({ ...(initialValues ?? {}), ...omitBy(values, isUndefined) }, SAVE_CONNECTION_FIELDS);

// Fields an edit's test sends when the user changed them; `customHeaders` is compared in its sanitized form.
const CHANGED_TEST_FIELDS = [
  'endpoint',
  'authMethod',
  'authMode',
  'username',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'appId',
  'cloudId',
  'clientId',
  'secretKey',
  'clientSecret',
  'proxy',
  'dbUrl',
  'companyId',
  'organization',
  'org',
  'enterprise',
  'organizationId',
  'workspaceSlug',
  'loginUrl',
  'instanceUrl',
  'apiVersion',
  'enableWebhook',
  'webhookSharedKey',
  'customHeaders',
];

const NEW_TEST_FIELDS = [
  'name',
  'endpoint',
  'token',
  'accessToken',
  'refreshToken',
  'username',
  'password',
  'proxy',
  'authMethod',
  'authMode',
  'appId',
  'cloudId',
  'clientId',
  'secretKey',
  'clientSecret',
  'accessKeyId',
  'secretAccessKey',
  'region',
  'bucket',
  'identityStoreId',
  'identityStoreRegion',
  'rateLimitPerHour',
  'tenantId',
  'tenantType',
  'dbUrl',
  'companyId',
  'organization',
  'org',
  'enterprise',
  'organizationId',
  'loginUrl',
  'instanceUrl',
  'apiVersion',
  'workspaceSlug',
  'enableWebhook',
  'webhookSharedKey',
  'customHeaders',
];

export const sanitizeCustomHeaders = (
  headers?: Array<{ key?: string; value?: string }>,
): ICustomHeader[] | undefined => {
  if (!headers) return headers;

  return headers
    .filter((header) => header.key?.trim() || header.value?.trim())
    .map((header) => ({ key: header.key?.trim() ?? '', value: header.value ?? '' }));
};

export const buildChangedTestPayload = (
  saved: ConnectionFormValues | undefined,
  values: ConnectionFormValues,
  customHeaders: ICustomHeader[] | undefined,
): ConnectionFormValues =>
  Object.fromEntries(
    CHANGED_TEST_FIELDS.map((field) => {
      const next = field === 'customHeaders' ? customHeaders : values[field];
      return [field, isEqual(saved?.[field], next) ? undefined : next];
    }),
  );

export const buildNewTestPayload = (
  initialValues: ConnectionFormValues,
  values: ConnectionFormValues,
  customHeaders: ICustomHeader[] | undefined,
): ConnectionFormValues => pick({ ...initialValues, ...values, customHeaders }, NEW_TEST_FIELDS);
