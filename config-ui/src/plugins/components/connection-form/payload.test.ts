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

import { deepEqual } from 'node:assert/strict';
import { test } from 'node:test';

import { buildConnectionSavePayload } from './payload';

test('preserves plugin defaults when save values only include touched fields', () => {
  const payload = buildConnectionSavePayload(
    {
      endpoint: 'https://api.github.com/',
      authMethod: 'AccessToken',
    },
    {
      name: 'GitHub',
      token: 'token',
    },
  );

  deepEqual(payload, {
    endpoint: 'https://api.github.com/',
    authMethod: 'AccessToken',
    name: 'GitHub',
    token: 'token',
  });
});

test('uses form values when they override plugin defaults', () => {
  const payload = buildConnectionSavePayload(
    {
      endpoint: 'https://api.github.com/',
      authMethod: 'AccessToken',
    },
    {
      endpoint: 'https://github.example.com/api/v3/',
      authMethod: 'AppKey',
      name: 'GitHub Enterprise',
    },
  );

  deepEqual(payload, {
    endpoint: 'https://github.example.com/api/v3/',
    authMethod: 'AppKey',
    name: 'GitHub Enterprise',
  });
});

test('drops defaults that are not supported connection save fields', () => {
  const payload = buildConnectionSavePayload(
    {
      endpoint: 'https://api.github.com/',
      unexpectedDefault: 'do-not-send',
    },
    {
      name: 'GitHub',
      token: 'token',
    },
  );

  deepEqual(payload, {
    endpoint: 'https://api.github.com/',
    name: 'GitHub',
    token: 'token',
  });
});

test('handles undefined initialValues without throwing', () => {
  const payload = buildConnectionSavePayload(undefined, {
    name: 'GitHub',
    token: 'token',
  });

  deepEqual(payload, {
    name: 'GitHub',
    token: 'token',
  });
});

// Empty `values` is not a realistic save (the backend requires a `name`),
// but the helper itself must not throw or strip defaults if it ever happens.
test('does not throw when values is empty and preserves defaults', () => {
  const payload = buildConnectionSavePayload(
    {
      endpoint: 'https://api.github.com/',
      authMethod: 'AccessToken',
    },
    {},
  );

  deepEqual(payload, {
    endpoint: 'https://api.github.com/',
    authMethod: 'AccessToken',
  });
});

test('lets an explicit empty string in values clear a default', () => {
  const payload = buildConnectionSavePayload(
    {
      endpoint: 'https://api.github.com/',
      proxy: 'http://proxy:8080',
    },
    { name: 'GitHub', proxy: '' },
  );

  deepEqual(payload, {
    endpoint: 'https://api.github.com/',
    name: 'GitHub',
    proxy: '',
  });
});

test('lets an explicit false in values override a true default', () => {
  const payload = buildConnectionSavePayload({ enableWebhook: true }, { name: 'GitHub', enableWebhook: false });

  deepEqual(payload, {
    name: 'GitHub',
    enableWebhook: false,
  });
});

test('ignores explicit undefined in values so defaults are preserved', () => {
  const payload = buildConnectionSavePayload(
    { endpoint: 'https://api.github.com/' },
    { endpoint: undefined, name: 'GitHub' },
  );

  deepEqual(payload, {
    endpoint: 'https://api.github.com/',
    name: 'GitHub',
  });
});

test('preserves saved github app fields when update values are incomplete', () => {
  const payload = buildConnectionSavePayload(
    {
      endpoint: 'https://api.github.com/',
      authMethod: 'AppKey',
      appId: '3702997',
      secretKey: '-----BEGIN RSA PRIVATE KEY-----***-----END RSA PRIVATE KEY-----',
      installationId: 132075486,
    },
    {
      name: 'Github App Tesing',
      appId: '3702997',
      secretKey: undefined,
      installationId: undefined,
    },
  );

  deepEqual(payload, {
    endpoint: 'https://api.github.com/',
    authMethod: 'AppKey',
    appId: '3702997',
    secretKey: '-----BEGIN RSA PRIVATE KEY-----***-----END RSA PRIVATE KEY-----',
    installationId: 132075486,
    name: 'Github App Tesing',
  });
});

test('keeps custom headers in the save payload', () => {
  const payload = buildConnectionSavePayload(
    {
      endpoint: 'https://api.anthropic.com/v1/',
    },
    {
      name: 'Claude Code',
      token: 'token',
      customHeaders: [{ key: 'X-Middleware-Auth', value: 'secret' }],
    },
  );

  deepEqual(payload, {
    endpoint: 'https://api.anthropic.com/v1/',
    name: 'Claude Code',
    token: 'token',
    customHeaders: [{ key: 'X-Middleware-Auth', value: 'secret' }],
  });
});

test('keeps saved custom headers when the form does not set them', () => {
  const payload = buildConnectionSavePayload(
    {
      endpoint: 'https://api.anthropic.com/v1/',
      customHeaders: [{ key: 'X-Middleware-Auth', value: 'secret' }],
    },
    {
      name: 'Claude Code',
      customHeaders: undefined,
    },
  );

  deepEqual(payload, {
    endpoint: 'https://api.anthropic.com/v1/',
    customHeaders: [{ key: 'X-Middleware-Auth', value: 'secret' }],
    name: 'Claude Code',
  });
});
