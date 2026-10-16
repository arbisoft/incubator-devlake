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

import type { ProviderId, ProviderRule } from './types';

export const PROVIDER_ID = {
  GOOGLE: 'google',
  MICROSOFT: 'microsoft',
  OKTA: 'okta',
  GITHUB: 'github',
  GITLAB: 'gitlab',
  AUTH0: 'auth0',
  KEYCLOAK: 'keycloak',
} as const;

export const LOGIN_PARAMS = { RETURN_URL: 'return_url', ERROR: 'error', ACCESS_DENIED: 'access_denied' } as const;

export const COPY = {
  title: 'Sign in',
  subtitle: 'Use your work account to continue.',
  usernameLabel: 'Username',
  passwordLabel: 'Password',
  usernameRequired: 'Enter your username.',
  passwordRequired: 'Enter your password.',
  passwordHelp: 'Lost your password? Ask your DevLake administrator to reset it.',
  submit: 'Sign in',
  divider: 'or continue with single sign-on',
  continueWith: (displayName: string) => `Continue with ${displayName}`,
  accessDenied: 'Your account is not currently allowed to access DevLake.',
  methodsLoadError: 'Failed to load login methods',
  invalidCredentials: 'Invalid username or password.',
  signInFailed: 'Sign-in failed. Try again, or contact your DevLake administrator if it keeps happening.',
  tooManyAttempts: 'Too many sign-in attempts. Try again in a few minutes.',
  apiKeyHint:
    'Single Sign-On is not configured. Use an API key (Authorization: Bearer ...) to access /rest endpoints, or ask your administrator to enable OIDC.',
  noProviders: 'No login providers are enabled.',
  noProvidersHint:
    'Set AUTH_ENABLED=true and configure OIDC_PROVIDERS + per-provider env vars, or sign in upstream of DevLake.',
  logoAlt: {
    [PROVIDER_ID.GOOGLE]: 'Google logo',
    [PROVIDER_ID.MICROSOFT]: 'Microsoft logo',
    [PROVIDER_ID.OKTA]: 'Okta logo',
    [PROVIDER_ID.GITHUB]: 'GitHub logo',
    [PROVIDER_ID.GITLAB]: 'GitLab logo',
    [PROVIDER_ID.AUTH0]: 'Auth0 logo',
    [PROVIDER_ID.KEYCLOAK]: 'Keycloak logo',
  } satisfies Record<ProviderId, string>,
  footerNote: 'Your administrator controls who can sign in.',
  layout: {
    wordmarkAlt: 'Arbisoft',
    headline: 'Engineering metrics from the tools you already use.',
    support: 'Connect your delivery tools and turn their data into DORA and engineering metrics your team can act on.',
    tiles: [
      { value: '4', label: 'DORA metrics' },
      { value: '100%', label: 'Self-hosted' },
      { value: 'Apache 2.0', label: 'Open source' },
    ],
  },
};

export const LOGIN_ERROR_MAP: Record<string, string> = {
  '401': COPY.invalidCredentials,
  '429': COPY.tooManyAttempts,
};

// Matched in order; a host is compared lowercased and without its port.
export const PROVIDER_RULES: ProviderRule[] = [
  { id: PROVIDER_ID.GOOGLE, hosts: ['accounts.google.com'] },
  { id: PROVIDER_ID.MICROSOFT, hosts: ['login.microsoftonline.com'] },
  { id: PROVIDER_ID.OKTA, suffixes: ['.okta.com'] },
  { id: PROVIDER_ID.GITHUB, hosts: ['github.com'] },
  { id: PROVIDER_ID.GITLAB, hosts: ['gitlab.com'] },
  { id: PROVIDER_ID.AUTH0, suffixes: ['.auth0.com'] },
  { id: PROVIDER_ID.KEYCLOAK, contains: ['keycloak'] },
];
