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

import axios, { HttpStatusCode } from 'axios';

import {
  GRAFANA_PROVIDER_KIND,
  OIDC_PROVIDER_SYNC_STATUS,
  type AccessUser,
  type AccessDomain,
  type OIDCProvider,
  type OIDCProviderInput,
} from '@/api/access';
import { toUserMessage } from '@/ui/utils';

import {
  ACCESS_ERROR,
  AUTHENTICATION_STATE,
  CREATE_DOMAIN_ERROR_MAP,
  CREATE_USER_ERROR_MAP,
  DUPLICATE_DOMAIN_SERVER_TEXT,
  DUPLICATE_USER_SERVER_TEXT,
  LOCAL_CREDENTIAL_ERROR_MAP,
  OIDC_PROVIDER_ERROR_MAP,
  OIDC_PROVIDER_STATUS,
  PAGE_SIZE_OPTIONS,
} from './constants';

export { ACCESS_ERROR };

export const normalizeDomain = (value: string) => value.trim().toLowerCase();

export const isValidDomain = (value: string) => {
  const domain = normalizeDomain(value);
  return (
    domain.length > 0 &&
    !/[\s@]/.test(domain) &&
    !domain.startsWith('.') &&
    !domain.endsWith('.') &&
    !domain.includes('..') &&
    !(domain.startsWith('[') && domain.endsWith(']'))
  );
};

export const isValidEmail = (value: string) => {
  const email = value.trim();
  const at = email.indexOf('@');
  return at > 0 && at === email.lastIndexOf('@') && isValidDomain(email.slice(at + 1)) && !/\s/.test(email);
};

export const isValidLocalLoginName = (value: string) => /^[a-z0-9][a-z0-9._-]{2,63}$/i.test(value.trim());

const BAD_REQUEST_ONLY = [HttpStatusCode.BadRequest];
const BAD_REQUEST_OR_NOT_FOUND = [HttpStatusCode.BadRequest, HttpStatusCode.NotFound];
const BAD_REQUEST_OR_UNAVAILABLE = [HttpStatusCode.BadRequest, HttpStatusCode.ServiceUnavailable];

const mapAccessError = (error: unknown, statuses: number[], map: Record<string, string>, fallback: string) => {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  return status !== undefined && statuses.includes(status) ? toUserMessage(error, map, fallback) : fallback;
};

const serverMessage = (error: unknown) => {
  if (!axios.isAxiosError<{ message?: unknown }>(error) || error.response?.status !== HttpStatusCode.BadRequest) {
    return '';
  }
  return typeof error.response.data?.message === 'string' ? error.response.data.message : '';
};

export const getCreateUserError = (error: unknown) => {
  const mapped = mapAccessError(error, BAD_REQUEST_ONLY, CREATE_USER_ERROR_MAP, '');
  if (mapped) return mapped;

  const message = serverMessage(error);
  if (message.includes(DUPLICATE_USER_SERVER_TEXT)) return ACCESS_ERROR.DUPLICATE_USER;
  return message ? ACCESS_ERROR.INVALID_USER : ACCESS_ERROR.REQUEST_FAILED;
};

export const getLocalCredentialError = (error: unknown) =>
  mapAccessError(error, BAD_REQUEST_OR_NOT_FOUND, LOCAL_CREDENTIAL_ERROR_MAP, ACCESS_ERROR.REQUEST_FAILED);

export const getCreateDomainError = (error: unknown) => {
  const mapped = mapAccessError(error, BAD_REQUEST_ONLY, CREATE_DOMAIN_ERROR_MAP, '');
  if (mapped) return mapped;

  const message = serverMessage(error);
  if (message.includes(DUPLICATE_DOMAIN_SERVER_TEXT)) return ACCESS_ERROR.DUPLICATE_DOMAIN;
  return message ? ACCESS_ERROR.INVALID_DOMAIN : ACCESS_ERROR.REQUEST_FAILED;
};

export const normalizeOIDCProviderInput = (provider: OIDCProviderInput): OIDCProviderInput => ({
  providerKey: provider.providerKey.trim().toLowerCase(),
  displayName: provider.displayName.trim(),
  issuerUrl: provider.issuerUrl.trim(),
  clientId: provider.clientId.trim(),
  clientSecret: provider.clientSecret.trim(),
  scopes: provider.scopes
    .split(/[\s,]+/)
    .filter(Boolean)
    .filter((scope, index, scopes) => scopes.indexOf(scope) === index)
    .join(' '),
  grafanaTarget: provider.grafanaTarget,
  confirmDevlakeOnly: provider.confirmDevlakeOnly,
  revision: provider.revision,
});

export const formFromOIDCProvider = (provider?: OIDCProvider): OIDCProviderInput => ({
  providerKey: provider?.providerKey ?? '',
  displayName: provider?.displayName ?? '',
  issuerUrl: provider?.issuerUrl ?? '',
  clientId: provider?.clientId ?? '',
  clientSecret: '',
  scopes: provider?.scopes ?? 'openid profile email',
  grafanaTarget: provider?.grafanaTarget ?? GRAFANA_PROVIDER_KIND.NONE,
  confirmDevlakeOnly: provider ? provider.grafanaTarget === GRAFANA_PROVIDER_KIND.NONE : false,
  revision: provider?.providerRevision,
});

export const isValidOIDCProviderInput = (
  provider: OIDCProviderInput,
  configuredProvider?: OIDCProvider,
  allowLocalOidc = false,
) => {
  const normalized = normalizeOIDCProviderInput(provider);
  let issuer: URL;
  try {
    issuer = new URL(normalized.issuerUrl);
  } catch {
    return false;
  }
  const isLocalHTTP =
    issuer.protocol === 'http:' && (issuer.hostname === 'localhost' || issuer.hostname === '127.0.0.1');
  const requiresReplacementSecret =
    !configuredProvider?.secretConfigured || normalized.clientId !== configuredProvider.clientId;
  return (
    /^[a-z0-9_-]{1,64}$/.test(normalized.providerKey) &&
    normalized.displayName.length > 0 &&
    normalized.clientId.length > 0 &&
    (!requiresReplacementSecret || normalized.clientSecret.length > 0) &&
    (issuer.protocol === 'https:' || (allowLocalOidc && isLocalHTTP)) &&
    normalized.scopes.split(' ').includes('openid') &&
    (normalized.grafanaTarget !== GRAFANA_PROVIDER_KIND.NONE || normalized.confirmDevlakeOnly)
  );
};

export const getOIDCProviderError = (error: unknown) =>
  mapAccessError(error, BAD_REQUEST_OR_UNAVAILABLE, OIDC_PROVIDER_ERROR_MAP, ACCESS_ERROR.OIDC_PROVIDER_FAILED);

export const getOIDCProviderStatus = (provider?: OIDCProvider) => {
  if (!provider) return OIDC_PROVIDER_STATUS.CONFIGURED;
  if (provider.retiredAt) return OIDC_PROVIDER_STATUS.RETIRED;
  if (provider.grafanaSyncStatus === OIDC_PROVIDER_SYNC_STATUS.COMPENSATION_FAILED)
    return OIDC_PROVIDER_STATUS.RECOVERY;
  if (provider.grafanaSyncStatus === OIDC_PROVIDER_SYNC_STATUS.COMPENSATED) return OIDC_PROVIDER_STATUS.COMPENSATED;
  if (provider.grafanaSyncStatus === OIDC_PROVIDER_SYNC_STATUS.FAILED) return OIDC_PROVIDER_STATUS.FAILED;
  if (!provider.enabled) return OIDC_PROVIDER_STATUS.DISABLED;
  if (provider.grafanaTarget === GRAFANA_PROVIDER_KIND.NONE) return OIDC_PROVIDER_STATUS.DEVLAKE_ONLY;
  if (provider.providerRevision > provider.grafanaSyncedRevision) return OIDC_PROVIDER_STATUS.PENDING;
  return OIDC_PROVIDER_STATUS.ACTIVE;
};

export const getAuthenticationState = (providers: OIDCProvider[]) => {
  if (providers.length === 0) return AUTHENTICATION_STATE.NO_MANAGED_OIDC;
  if (providers.some((provider) => provider.databaseSourceActive && provider.enabled)) {
    return AUTHENTICATION_STATE.OIDC_ACTIVE;
  }
  if (providers.some((provider) => provider.hasCandidate)) return AUTHENTICATION_STATE.ACTIVATION_REQUIRED;
  return AUTHENTICATION_STATE.NO_ACTIVE_OIDC;
};

export const canActivateOIDCProvider = (provider?: OIDCProvider) => {
  if (!provider?.providerKey || provider.grafanaSyncStatus === OIDC_PROVIDER_SYNC_STATUS.COMPENSATION_FAILED)
    return false;
  return !provider.databaseSourceActive || provider.hasCandidate;
};

export const canSelectGenericOIDCProvider = (provider: OIDCProvider) =>
  provider.enabled &&
  !provider.hasCandidate &&
  provider.grafanaTarget === GRAFANA_PROVIDER_KIND.NONE &&
  provider.grafanaSyncStatus !== OIDC_PROVIDER_SYNC_STATUS.COMPENSATION_FAILED;

export const getUserLabel = (user: AccessUser) => user.email || user.localLoginName || user.displayName;

export const getUserIdentity = (user: AccessUser) => ({
  primary: user.displayName,
  secondary: user.email || user.localLoginName,
});

export const getDomainLabel = (domain: AccessDomain) => domain.domain;

export const toAccessPagination = ({ page, pageSize }: { page: number; pageSize: number }) => ({
  page,
  pageSize: PAGE_SIZE_OPTIONS.find((size) => size === pageSize) ?? PAGE_SIZE_OPTIONS[0],
});
