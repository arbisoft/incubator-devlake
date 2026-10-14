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

import { PROVIDER_ID } from './constants';
import { PROVIDER_LOGOS } from './logos';
import { matchProviderLogo, normalizeLoginReturnPath } from './utils';

describe('routes/login/utils', () => {
  it('keeps a relative return path under the configured application prefix', () => {
    expect(normalizeLoginReturnPath('/devlake/connections?tab=active', '/devlake/')).toBe(
      '/devlake/connections?tab=active',
    );
  });

  it('rejects external and malformed login return paths', () => {
    expect(normalizeLoginReturnPath('https://example.com', '/devlake/')).toBe('/devlake/');
    expect(normalizeLoginReturnPath('//example.com', '/devlake/')).toBe('/devlake/');
    expect(normalizeLoginReturnPath('connections', '/devlake/')).toBe('/devlake/');
    expect(normalizeLoginReturnPath('/\\example.com', '/devlake/')).toBe('/devlake/');
    expect(normalizeLoginReturnPath('/%5cexample.com', '/devlake/')).toBe('/devlake/');
    expect(normalizeLoginReturnPath(`${window.location.origin}/devlake/connections`, '/devlake/')).toBe('/devlake/');
    expect(normalizeLoginReturnPath('/devlake/connections', '/devlake/')).toBe('/devlake/connections');
  });

  it.each([
    '/\t/example.com',
    '/\n/example.com',
    '/\r/example.com',
    '/\t//example.com',
    '/\n//example.com',
    '/\r//example.com',
  ])('rejects a path parsed as an external host after whitespace normalization', (path) => {
    expect(normalizeLoginReturnPath(path, '/')).toBe('/');
  });

  it('keeps canonical local paths within the configured prefix', () => {
    expect(normalizeLoginReturnPath('/devlakeevil/connections', '/devlake/')).toBe('/devlake/');
    expect(normalizeLoginReturnPath('/devlake/../outside', '/devlake/')).toBe('/devlake/');
    expect(normalizeLoginReturnPath('/devlake/connections/../projects', '/devlake/')).toBe('/devlake/projects');
    expect(normalizeLoginReturnPath('/devlake/%2F%2Fexample.com?tab=active#list', '/devlake/')).toBe(
      '/devlake/%2F%2Fexample.com?tab=active#list',
    );
  });

  it.each([
    ['accounts.google.com', PROVIDER_ID.GOOGLE],
    ['login.microsoftonline.com', PROVIDER_ID.MICROSOFT],
    ['dev-123456.okta.com', PROVIDER_ID.OKTA],
    ['github.com', PROVIDER_ID.GITHUB],
    ['gitlab.com', PROVIDER_ID.GITLAB],
    ['tenant.eu.auth0.com', PROVIDER_ID.AUTH0],
    ['keycloak.example.com', PROVIDER_ID.KEYCLOAK],
  ])('matches %s to its provider logo', (host, id) => {
    expect(matchProviderLogo(host)).toBe(PROVIDER_LOGOS[id]);
  });

  it('ignores the port, the letter case and a trailing dot of the host', () => {
    expect(matchProviderLogo('Accounts.Google.com:443')).toBe(PROVIDER_LOGOS[PROVIDER_ID.GOOGLE]);
    expect(matchProviderLogo('acme.okta.com.')).toBe(PROVIDER_LOGOS[PROVIDER_ID.OKTA]);
  });

  it('does not match look-alike hosts', () => {
    expect(matchProviderLogo('okta.com')).toBeUndefined();
    expect(matchProviderLogo('notgithub.com')).toBeUndefined();
    expect(matchProviderLogo('accounts.google.com.evil.example')).toBeUndefined();
  });

  it('returns nothing for an unknown or missing host', () => {
    expect(matchProviderLogo('sso.example.com')).toBeUndefined();
    expect(matchProviderLogo('')).toBeUndefined();
    expect(matchProviderLogo(undefined)).toBeUndefined();
  });
});
