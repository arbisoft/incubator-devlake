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

import { AxiosError, AxiosHeaders, HttpStatusCode } from 'axios';
import { describe, expect, it } from 'vitest';

// Load the routes barrel first so the config/routes import cycle resolves as it does in the app.
import '@/routes';
import { STATUS_TONE } from '@/ui';

import {
  ACCESS_ERROR_CODE,
  ACCESS_STATUS,
  GRAFANA_PROVIDER_KIND,
  OIDC_PROVIDER_SYNC_STATUS,
  type OIDCProvider,
} from '../../api/access';

import { AUTHENTICATION_STATE, OIDC_PROVIDER_STATUS, OIDC_PROVIDER_STATUS_TONE } from './authentication/constants';
import {
  ACCESS_ERROR,
  canActivateOIDCProvider,
  getAuthenticationState,
  formFromOIDCProvider,
  getCreateDomainError,
  getCreateUserError,
  getLocalCredentialError,
  getOIDCProviderError,
  getOIDCProviderStatus,
  getUpdateAccessError,
  isValidDomain,
  isValidEmail,
  isValidLocalLoginName,
  isValidOIDCProviderInput,
  normalizeOIDCProviderInput,
  canSelectGenericOIDCProvider,
  normalizeDomain,
  toStatusFilter,
} from './utils';

const createAxiosError = (status: number, data: unknown) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: status === 400 ? 'Bad Request' : 'Internal Server Error',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  });

describe('routes/settings/utils', () => {
  it('normalizes allowed-domain input before it is submitted', () => {
    expect(normalizeDomain(' Example.COM ')).toBe('example.com');
  });

  it('rejects invalid allowed-domain input locally', () => {
    expect(isValidDomain('example.com')).toBe(true);
    expect(isValidDomain('example')).toBe(true);
    expect(isValidDomain('')).toBe(false);
    expect(isValidDomain('example..com')).toBe(false);
    expect(isValidDomain('person@example.com')).toBe(false);
    expect(isValidDomain('@example.com')).toBe(false);
    expect(isValidDomain('[192.168.1.1]')).toBe(false);
    expect(isValidDomain('example.com.')).toBe(false);
  });

  it('rejects invalid email input locally', () => {
    expect(isValidEmail('person@example.com')).toBe(true);
    expect(isValidEmail('person@example')).toBe(true);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('person@example.com ')).toBe(true);
    expect(isValidEmail('person @example.com')).toBe(false);
    expect(isValidEmail('person@example..com')).toBe(false);
  });

  it('accepts only supported local usernames', () => {
    expect(isValidLocalLoginName('admin')).toBe(true);
    expect(isValidLocalLoginName('Person.Name_1')).toBe(true);
    expect(isValidLocalLoginName('ab')).toBe(false);
    expect(isValidLocalLoginName('-admin')).toBe(false);
    expect(isValidLocalLoginName('admin name')).toBe(false);
    expect(isValidLocalLoginName('admin@example.com')).toBe(false);
  });

  it('maps create-user error codes to safe UI copy', () => {
    const duplicateErr = createAxiosError(HttpStatusCode.BadRequest, {
      code: ACCESS_ERROR_CODE.DUPLICATE_USER,
      message: 'this email already has a DevLake access entry',
    });
    expect(getCreateUserError(duplicateErr)).toBe(ACCESS_ERROR.DUPLICATE_USER);

    const invalidErr = createAxiosError(HttpStatusCode.BadRequest, {
      code: ACCESS_ERROR_CODE.INVALID_USER,
      message: 'provide a valid email and role',
    });
    expect(getCreateUserError(invalidErr)).toBe(ACCESS_ERROR.INVALID_USER);

    const serverErr = createAxiosError(HttpStatusCode.InternalServerError, {
      message: 'internal server error',
    });
    expect(getCreateUserError(serverErr)).toBe(ACCESS_ERROR.REQUEST_FAILED);

    expect(getCreateUserError(new Error('network error'))).toBe(ACCESS_ERROR.REQUEST_FAILED);
  });

  it('maps role and status update errors to safe UI copy', () => {
    const invalid = createAxiosError(HttpStatusCode.BadRequest, { code: ACCESS_ERROR_CODE.INVALID_USER });
    const invalidDomain = createAxiosError(HttpStatusCode.BadRequest, { code: ACCESS_ERROR_CODE.INVALID_DOMAIN });
    const lastAdmin = createAxiosError(HttpStatusCode.BadRequest, {
      message: 'keep at least one active customer administrator',
    });
    const missing = createAxiosError(HttpStatusCode.NotFound, { message: 'access user not found' });

    expect(getUpdateAccessError(invalid)).toBe(ACCESS_ERROR.INVALID_UPDATE);
    expect(getUpdateAccessError(invalidDomain)).toBe(ACCESS_ERROR.INVALID_UPDATE);
    expect(getUpdateAccessError(lastAdmin)).toBe(ACCESS_ERROR.LAST_ADMIN);
    expect(getUpdateAccessError(missing)).toBe(ACCESS_ERROR.ENTRY_NOT_FOUND);
  });

  it('keeps an unmapped bad-request message, and hides every other failure behind the generic copy', () => {
    const unmapped = createAxiosError(HttpStatusCode.BadRequest, { message: 'provide something else' });
    const server = createAxiosError(HttpStatusCode.InternalServerError, { message: 'error saving access user: sql' });

    expect(getUpdateAccessError(unmapped)).toBe('provide something else');
    expect(getUpdateAccessError(server)).toBe(ACCESS_ERROR.REQUEST_FAILED);
    expect(getUpdateAccessError(new Error('network error'))).toBe(ACCESS_ERROR.REQUEST_FAILED);
  });

  it('maps local credential lifecycle errors to safe UI copy', () => {
    const missingCredential = createAxiosError(HttpStatusCode.NotFound, {
      code: ACCESS_ERROR_CODE.LOCAL_CREDENTIAL_MISSING,
    });
    const finalMethod = createAxiosError(HttpStatusCode.BadRequest, {
      code: ACCESS_ERROR_CODE.LAST_LOGIN_METHOD,
    });

    expect(getLocalCredentialError(missingCredential)).toBe(ACCESS_ERROR.LOCAL_CREDENTIAL_MISSING);
    expect(getLocalCredentialError(finalMethod)).toBe(ACCESS_ERROR.LAST_LOGIN_METHOD);
  });

  it('maps local credential errors with username-specific copy', () => {
    const duplicate = createAxiosError(HttpStatusCode.BadRequest, {
      code: ACCESS_ERROR_CODE.DUPLICATE_USER,
    });
    const invalid = createAxiosError(HttpStatusCode.BadRequest, {
      code: ACCESS_ERROR_CODE.INVALID_USER,
    });

    expect(getLocalCredentialError(duplicate)).toBe('This username already has a DevLake local password.');
    expect(getLocalCredentialError(invalid)).toBe('Enter a valid username, then try again.');
  });

  it('maps create-domain error codes to safe UI copy', () => {
    const duplicateErr = createAxiosError(HttpStatusCode.BadRequest, {
      code: ACCESS_ERROR_CODE.DUPLICATE_DOMAIN,
      message: 'this domain already has a DevLake access policy',
    });
    expect(getCreateDomainError(duplicateErr)).toBe(ACCESS_ERROR.DUPLICATE_DOMAIN);

    const invalidErr = createAxiosError(HttpStatusCode.BadRequest, {
      code: ACCESS_ERROR_CODE.INVALID_DOMAIN,
      message: 'provide a valid domain and default role',
    });
    expect(getCreateDomainError(invalidErr)).toBe(ACCESS_ERROR.INVALID_DOMAIN);

    const serverErr = createAxiosError(HttpStatusCode.InternalServerError, {
      message: 'internal server error',
    });
    expect(getCreateDomainError(serverErr)).toBe(ACCESS_ERROR.REQUEST_FAILED);

    expect(getCreateDomainError(new Error('network error'))).toBe(ACCESS_ERROR.REQUEST_FAILED);
  });

  it('normalizes and validates OIDC provider settings locally', () => {
    const provider = normalizeOIDCProviderInput({
      providerKey: ' Google-Workspace ',
      displayName: ' Google Workspace ',
      issuerUrl: ' https://accounts.example.com/ ',
      clientId: ' client-id ',
      clientSecret: ' secret ',
      scopes: 'openid, profile openid email',
      grafanaTarget: GRAFANA_PROVIDER_KIND.GOOGLE,
      confirmDevlakeOnly: false,
    });

    expect(provider.providerKey).toBe('google-workspace');
    expect(provider.issuerUrl).toBe('https://accounts.example.com/');
    expect(provider.scopes).toBe('openid profile email');
    expect(isValidOIDCProviderInput(provider)).toBe(true);
    expect(isValidOIDCProviderInput({ ...provider, providerKey: 'invalid/key' })).toBe(false);
    expect(isValidOIDCProviderInput({ ...provider, issuerUrl: 'http://issuer.example.com' })).toBe(false);
    expect(isValidOIDCProviderInput({ ...provider, scopes: 'profile email' })).toBe(false);
    expect(isValidOIDCProviderInput({ ...provider, issuerUrl: 'http://localhost:5556' })).toBe(false);
    expect(isValidOIDCProviderInput({ ...provider, issuerUrl: 'http://localhost:5556' }, undefined, true)).toBe(true);
  });

  it('allows stored OIDC credentials only for the unchanged client ID', () => {
    const provider = normalizeOIDCProviderInput({
      providerKey: 'google',
      displayName: 'Google',
      issuerUrl: 'https://accounts.example.com',
      clientId: 'client-a',
      clientSecret: '',
      scopes: 'openid profile email',
      grafanaTarget: GRAFANA_PROVIDER_KIND.GENERIC_OAUTH,
      confirmDevlakeOnly: false,
    });
    const configuredProvider: OIDCProvider = {
      providerKey: 'google',
      displayName: 'Google',
      issuerUrl: 'https://accounts.example.com',
      clientId: 'client-a',
      scopes: 'openid profile email',
      enabled: true,
      secretConfigured: true,
      databaseSourceActive: true,
      grafanaSyncStatus: OIDC_PROVIDER_SYNC_STATUS.SYNCHRONIZED,
      grafanaSyncedRevision: 1,
      providerRevision: 1,
      hasCandidate: false,
      grafanaTarget: GRAFANA_PROVIDER_KIND.GENERIC_OAUTH,
      devlakeCallbackUrl: 'https://devlake.example.com/api/auth/callback',
      grafanaCallbackUrl: 'https://grafana.example.com/login/generic_oauth',
      allowLocalOidc: false,
    };

    expect(isValidOIDCProviderInput(provider, configuredProvider)).toBe(true);
    expect(isValidOIDCProviderInput({ ...provider, clientId: 'client-b' }, configuredProvider)).toBe(false);
  });

  it('creates a write-only OIDC provider form from configured state', () => {
    const provider: OIDCProvider = {
      providerKey: 'google',
      displayName: 'Google',
      issuerUrl: 'https://accounts.google.com',
      clientId: 'client',
      scopes: 'openid profile email',
      enabled: true,
      secretConfigured: true,
      databaseSourceActive: true,
      grafanaSyncStatus: OIDC_PROVIDER_SYNC_STATUS.SYNCHRONIZED,
      grafanaSyncedRevision: 1,
      providerRevision: 1,
      hasCandidate: false,
      grafanaTarget: GRAFANA_PROVIDER_KIND.GENERIC_OAUTH,
      devlakeCallbackUrl: 'https://devlake.example.com/api/auth/callback',
      grafanaCallbackUrl: 'https://grafana.example.com/login/generic_oauth',
      allowLocalOidc: false,
    };

    expect(formFromOIDCProvider(provider).clientSecret).toBe('');
    expect(formFromOIDCProvider(provider).scopes).toBe(provider.scopes);
    expect(formFromOIDCProvider().scopes).toBe('openid profile email');
    expect(formFromOIDCProvider().confirmDevlakeOnly).toBe(false);
    expect(formFromOIDCProvider(provider).confirmDevlakeOnly).toBe(false);
    expect(formFromOIDCProvider({ ...provider, grafanaTarget: GRAFANA_PROVIDER_KIND.NONE }).confirmDevlakeOnly).toBe(
      true,
    );
  });

  it('maps OIDC provider errors to safe user-facing messages', () => {
    const invalidProvider = createAxiosError(HttpStatusCode.BadRequest, {
      code: ACCESS_ERROR_CODE.INVALID_OIDC_PROVIDER,
    });
    const blockedProvider = createAxiosError(HttpStatusCode.BadRequest, {
      code: ACCESS_ERROR_CODE.OIDC_PROVIDER_BLOCKED,
    });
    const unavailableBlockedProvider = createAxiosError(HttpStatusCode.ServiceUnavailable, {
      code: ACCESS_ERROR_CODE.OIDC_PROVIDER_BLOCKED,
    });
    const unavailableUnknownProvider = createAxiosError(HttpStatusCode.ServiceUnavailable, {
      code: 'GRAFANA_CREDENTIAL_REJECTED',
    });
    const grafanaSyncFailed = createAxiosError(HttpStatusCode.ServiceUnavailable, {
      code: ACCESS_ERROR_CODE.GRAFANA_SYNC_FAILED,
    });

    expect(getOIDCProviderError(invalidProvider)).toBe(ACCESS_ERROR.INVALID_OIDC_PROVIDER);
    expect(getOIDCProviderError(blockedProvider)).toBe(ACCESS_ERROR.OIDC_PROVIDER_BLOCKED);
    expect(getOIDCProviderError(unavailableBlockedProvider)).toBe(ACCESS_ERROR.OIDC_PROVIDER_BLOCKED);
    expect(getOIDCProviderError(grafanaSyncFailed)).toBe(ACCESS_ERROR.GRAFANA_SYNC_FAILED);
    expect(getOIDCProviderError(unavailableUnknownProvider)).toBe(ACCESS_ERROR.OIDC_PROVIDER_FAILED);
    expect(getOIDCProviderError(new Error('network error'))).toBe(ACCESS_ERROR.OIDC_PROVIDER_FAILED);
  });

  it('summarizes OIDC provider lifecycle state without exposing internal synchronization details', () => {
    const disabledProvider: OIDCProvider = {
      providerKey: 'google',
      displayName: 'Google',
      issuerUrl: 'https://accounts.google.com',
      clientId: 'client',
      scopes: 'openid profile email',
      enabled: false,
      secretConfigured: true,
      databaseSourceActive: false,
      grafanaSyncStatus: OIDC_PROVIDER_SYNC_STATUS.SYNCHRONIZED,
      grafanaSyncedRevision: 1,
      providerRevision: 1,
      hasCandidate: false,
      grafanaTarget: GRAFANA_PROVIDER_KIND.GENERIC_OAUTH,
      devlakeCallbackUrl: 'https://devlake.example.com/api/auth/callback',
      grafanaCallbackUrl: 'https://grafana.example.com/login/generic_oauth',
      allowLocalOidc: false,
    };

    expect(getOIDCProviderStatus(undefined)).toBe(OIDC_PROVIDER_STATUS.CONFIGURED);
    expect(getOIDCProviderStatus(disabledProvider)).toBe(OIDC_PROVIDER_STATUS.DISABLED);
    expect(canActivateOIDCProvider(disabledProvider)).toBe(true);
    expect(getOIDCProviderStatus({ ...disabledProvider, databaseSourceActive: true, enabled: true })).toBe(
      OIDC_PROVIDER_STATUS.ACTIVE,
    );
    expect(
      getOIDCProviderStatus({
        ...disabledProvider,
        grafanaSyncStatus: OIDC_PROVIDER_SYNC_STATUS.COMPENSATION_FAILED,
      }),
    ).toBe(OIDC_PROVIDER_STATUS.RECOVERY);
    const compensatedProvider = { ...disabledProvider, grafanaSyncStatus: OIDC_PROVIDER_SYNC_STATUS.COMPENSATED };
    expect(getOIDCProviderStatus(compensatedProvider)).toBe(OIDC_PROVIDER_STATUS.COMPENSATED);
    expect(canActivateOIDCProvider(compensatedProvider)).toBe(true);
    expect(OIDC_PROVIDER_STATUS_TONE[OIDC_PROVIDER_STATUS.ACTIVE]).toBe(STATUS_TONE.SUCCESS);
    expect(OIDC_PROVIDER_STATUS_TONE[OIDC_PROVIDER_STATUS.COMPENSATED]).toBe(STATUS_TONE.WARNING);
    expect(OIDC_PROVIDER_STATUS_TONE[OIDC_PROVIDER_STATUS.RECOVERY]).toBe(STATUS_TONE.ERROR);
    expect(OIDC_PROVIDER_STATUS_TONE[OIDC_PROVIDER_STATUS.CONFIGURED]).toBe(STATUS_TONE.WARNING);
  });

  it('summarizes the authentication configuration state without inferring environment configuration', () => {
    const provider: OIDCProvider = {
      providerKey: 'google',
      displayName: 'Google',
      issuerUrl: 'https://accounts.google.com',
      clientId: 'client',
      scopes: 'openid profile email',
      enabled: false,
      secretConfigured: true,
      databaseSourceActive: false,
      grafanaSyncStatus: OIDC_PROVIDER_SYNC_STATUS.SYNCHRONIZED,
      grafanaSyncedRevision: 1,
      providerRevision: 1,
      hasCandidate: false,
      grafanaTarget: GRAFANA_PROVIDER_KIND.GOOGLE,
      devlakeCallbackUrl: 'https://devlake.example.com/api/auth/callback',
      grafanaCallbackUrl: 'https://grafana.example.com/login/google',
      allowLocalOidc: false,
    };

    expect(getAuthenticationState([])).toBe(AUTHENTICATION_STATE.NO_MANAGED_OIDC);
    expect(getAuthenticationState([{ ...provider, hasCandidate: true }])).toBe(
      AUTHENTICATION_STATE.ACTIVATION_REQUIRED,
    );
    expect(getAuthenticationState([provider])).toBe(AUTHENTICATION_STATE.NO_ACTIVE_OIDC);
    expect(getAuthenticationState([{ ...provider, enabled: true, databaseSourceActive: true }])).toBe(
      AUTHENTICATION_STATE.OIDC_ACTIVE,
    );
  });

  it('requires explicit DevLake-only confirmation and identifies a Generic OAuth candidate', () => {
    const devLakeOnly = normalizeOIDCProviderInput({
      providerKey: 'custom',
      displayName: 'Custom OIDC',
      issuerUrl: 'https://id.example.com',
      clientId: 'client',
      clientSecret: 'secret',
      scopes: 'openid email',
      grafanaTarget: GRAFANA_PROVIDER_KIND.NONE,
      confirmDevlakeOnly: false,
    });
    expect(isValidOIDCProviderInput(devLakeOnly)).toBe(false);
    expect(isValidOIDCProviderInput({ ...devLakeOnly, confirmDevlakeOnly: true })).toBe(true);

    const provider: OIDCProvider = {
      providerKey: 'custom',
      displayName: 'Custom OIDC',
      issuerUrl: 'https://id.example.com',
      clientId: 'client',
      scopes: 'openid email',
      grafanaTarget: GRAFANA_PROVIDER_KIND.NONE,
      enabled: true,
      secretConfigured: true,
      databaseSourceActive: true,
      grafanaSyncStatus: OIDC_PROVIDER_SYNC_STATUS.NOT_APPLICABLE,
      grafanaSyncedRevision: 0,
      providerRevision: 1,
      hasCandidate: false,
      devlakeCallbackUrl: 'https://devlake.example.com/api/auth/callback',
      grafanaCallbackUrl: 'https://grafana.example.com/login',
      allowLocalOidc: false,
    };
    expect(canSelectGenericOIDCProvider(provider)).toBe(true);
    expect(canSelectGenericOIDCProvider({ ...provider, enabled: false })).toBe(false);
    expect(canSelectGenericOIDCProvider({ ...provider, hasCandidate: true })).toBe(false);
  });

  it('accepts only known access statuses as a status filter', () => {
    expect(toStatusFilter(ACCESS_STATUS.ACTIVE)).toBe(ACCESS_STATUS.ACTIVE);
    expect(toStatusFilter(ACCESS_STATUS.DISABLED)).toBe(ACCESS_STATUS.DISABLED);
    expect(toStatusFilter('')).toBeUndefined();
    expect(toStatusFilter('inactive')).toBeUndefined();
    expect(toStatusFilter(undefined)).toBeUndefined();
  });
});
