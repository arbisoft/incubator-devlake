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

import { STATUS_TONE } from '@/ui/constants';

export const EXPIRATION = { DAYS_7: '7d', DAYS_30: '30d', DAYS_90: '90d', NEVER: 'never' } as const;

export const EXPIRATION_DAYS = {
  [EXPIRATION.DAYS_7]: 7,
  [EXPIRATION.DAYS_30]: 30,
  [EXPIRATION.DAYS_90]: 90,
  [EXPIRATION.NEVER]: null,
} as const;

export const DEFAULT_EXPIRATION = EXPIRATION.DAYS_30;
export const DEFAULT_ALLOWED_PATH = '.*';

export const EXPIRY_STATE = { ACTIVE: 'active', EXPIRED: 'expired', NEVER: 'never' } as const;

export const EXPIRY_TONE = {
  [EXPIRY_STATE.ACTIVE]: undefined,
  [EXPIRY_STATE.EXPIRED]: STATUS_TONE.ERROR,
  [EXPIRY_STATE.NEVER]: undefined,
} as const;

export const KEY_COLUMN = {
  NAME: 'name',
  EXPIRATION: 'expiredAt',
  ALLOWED_PATH: 'allowedPath',
  ACTIONS: 'actions',
} as const;

export const DATE_FORMAT = 'YYYY-MM-DD';
export const API_REST_PATH = '/api/rest/';

export const COPY = {
  title: 'API Keys',
  description: 'Generate and manage the API keys used to access the DevLake API.',
  tableLabel: 'API keys',
  searchPlaceholder: 'Search keys',
  newKey: 'New API key',
  columns: { name: 'Key name', expiration: 'Expiration', allowedPath: 'Allowed path' },
  noExpiration: 'No expiration',
  expired: 'Expired',
  revoke: 'Revoke',
  revokeKey: (name: string) => `Revoke ${name}`,
  empty: {
    title: 'No API keys yet',
    description: 'Generate a key to let a script or application call the DevLake API.',
  },
  noResults: {
    title: 'No API keys match your search',
    description: 'Try a different key name.',
  },
  expirationOptions: {
    [EXPIRATION.DAYS_7]: '7 days',
    [EXPIRATION.DAYS_30]: '30 days',
    [EXPIRATION.DAYS_90]: '90 days',
    [EXPIRATION.NEVER]: 'Never',
  },
  create: {
    title: 'Generate API key',
    submit: 'Generate',
    disabledReason: 'Enter a key name and an allowed path.',
    name: {
      label: 'Key name',
      description: 'Give the key a unique name so you can identify it later.',
      placeholder: 'API Key Name',
    },
    expiration: { label: 'Expiration', description: 'Set when this key expires.' },
    allowedPath: {
      label: 'Allowed path',
      description:
        'Enter a regular expression matching the API URLs this key may call. The default allows all endpoints.',
      docsLink: 'See the DevLake API docs',
      aria: 'Allowed path expression',
    },
    invalid: 'Check the key name, expiration and allowed path, then try again.',
  },
  generated: {
    title: 'Your API key is ready',
    description: "Copy it now — you won't be able to see it again.",
    copy: 'Copy API key',
    close: 'Close',
  },
  confirm: {
    title: (name: string) => `Revoke “${name}”?`,
    description:
      "Any apps or scripts using this key will immediately lose access to the DevLake API. This can't be undone.",
    confirm: 'Revoke key',
  },
};

export const ERROR_MAP = { '400': COPY.create.invalid };
