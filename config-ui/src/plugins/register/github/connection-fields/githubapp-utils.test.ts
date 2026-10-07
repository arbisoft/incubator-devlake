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

import { describe, expect, it } from 'vitest';

import {
  buildGithubInstallationOptions,
  invalidateGithubAppConfig,
  isMaskedGithubAppSecret,
  shouldValidateGithubAppConfig,
} from './githubapp-utils';

describe('plugins/register/github/connection-fields/githubapp-utils', () => {
  it('detects masked GitHub App private keys returned by the API', () => {
    expect(
      isMaskedGithubAppSecret('-----BEGIN RSA PRIVATE KEY-----\nMIIEpA********END\n-----END RSA PRIVATE KEY-----'),
    ).toBe(true);
    expect(
      isMaskedGithubAppSecret('-----BEGIN RSA PRIVATE KEY-----\nMIIEpAABCDEF\n-----END RSA PRIVATE KEY-----'),
    ).toBe(false);
  });

  it('does not validate saved masked GitHub App private keys', () => {
    expect(
      shouldValidateGithubAppConfig(
        'https://api.github.com/',
        '12345',
        '-----BEGIN RSA PRIVATE KEY-----\nMIIEpA********END\n-----END RSA PRIVATE KEY-----',
      ),
    ).toBe(false);
    expect(
      shouldValidateGithubAppConfig(
        'https://api.github.com/',
        '12345',
        '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAABCDEF\n-----END RSA PRIVATE KEY-----',
      ),
    ).toBe(true);
  });

  it('keeps saved installation visible when installations cannot be reloaded', () => {
    expect(buildGithubInstallationOptions(undefined, 98765)).toStrictEqual([
      { value: 98765, label: 'Saved installation (98765)' },
    ]);
  });

  it('does not duplicate saved installation option when GitHub returns it', () => {
    expect(
      buildGithubInstallationOptions(
        [
          {
            id: 98765,
            account: {
              login: 'apache',
            },
          },
        ],
        98765,
      ),
    ).toStrictEqual([{ value: 98765, label: 'apache' }]);
  });

  it('changing GitHub App ID clears stale validation and returns to untested state', () => {
    expect(
      invalidateGithubAppConfig(
        {
          appId: '12345',
          secretKey: 'private-key',
          installationId: 98765,
          status: 'valid',
          from: 'old-app',
          installations: [
            {
              id: 98765,
              account: {
                login: 'apache',
              },
            },
          ],
        },
        { appId: '67890' },
      ),
    ).toStrictEqual({
      appId: '67890',
      secretKey: 'private-key',
      installationId: undefined,
      status: 'idle',
      from: undefined,
      installations: undefined,
    });
  });

  it('changing GitHub App private key clears stale validation and returns to untested state', () => {
    expect(
      invalidateGithubAppConfig(
        {
          appId: '12345',
          secretKey: 'old-private-key',
          installationId: 98765,
          status: 'valid',
          from: 'old-app',
          installations: [
            {
              id: 98765,
              account: {
                login: 'apache',
              },
            },
          ],
        },
        { secretKey: 'new-private-key' },
      ),
    ).toStrictEqual({
      appId: '12345',
      secretKey: 'new-private-key',
      installationId: undefined,
      status: 'idle',
      from: undefined,
      installations: undefined,
    });
  });

  it('clearing a required GitHub App credential resets status to idle', () => {
    expect(
      invalidateGithubAppConfig(
        {
          appId: '12345',
          secretKey: 'private-key',
          installationId: 98765,
          status: 'valid',
          from: 'old-app',
        },
        { secretKey: '' },
      ),
    ).toStrictEqual({
      appId: '12345',
      secretKey: '',
      installationId: undefined,
      status: 'idle',
      from: undefined,
      installations: undefined,
    });
  });
});
