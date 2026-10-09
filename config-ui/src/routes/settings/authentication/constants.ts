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

import { ACCESS_ERROR_CODE, GRAFANA_PROVIDER_KIND, type GrafanaProviderKind } from '@/api/access/constants';
import { CONFIRM_TONE } from '@/ui/confirm-modal/constants';
import { STATUS_TONE } from '@/ui/constants';
import type { ConfirmConfig } from '@/ui/types';

import { ACCESS_ERROR } from '../constants';

export const OIDC_PROVIDER_ERROR_MAP: Record<string, string> = {
  [ACCESS_ERROR_CODE.INVALID_OIDC_PROVIDER]: ACCESS_ERROR.INVALID_OIDC_PROVIDER,
  [ACCESS_ERROR_CODE.OIDC_PROVIDER_BLOCKED]: ACCESS_ERROR.OIDC_PROVIDER_BLOCKED,
  [ACCESS_ERROR_CODE.OIDC_PROVIDER_MISSING]: ACCESS_ERROR.OIDC_PROVIDER_BLOCKED,
  [ACCESS_ERROR_CODE.OIDC_PROVIDER_REVISION_CONFLICT]: ACCESS_ERROR.OIDC_PROVIDER_STALE,
  [ACCESS_ERROR_CODE.GRAFANA_TARGET_CONFLICT]: ACCESS_ERROR.GRAFANA_TARGET_CONFLICT,
  [ACCESS_ERROR_CODE.GRAFANA_SYNC_FAILED]: ACCESS_ERROR.GRAFANA_SYNC_FAILED,
};

export const OIDC_PROVIDER_STATUS = {
  CONFIGURED: 'Configured',
  ACTIVE: 'Active',
  DISABLED: 'Disabled',
  DEVLAKE_ONLY: 'DevLake only',
  PENDING: 'Changes awaiting activation',
  FAILED: 'Grafana synchronization failed',
  COMPENSATED: 'Activation failed; Grafana restored',
  RECOVERY: 'Grafana recovery required',
  RETIRED: 'Retired',
} as const;

export const OIDC_PROVIDER_STATUS_TONE = {
  [OIDC_PROVIDER_STATUS.ACTIVE]: STATUS_TONE.SUCCESS,
  [OIDC_PROVIDER_STATUS.DEVLAKE_ONLY]: STATUS_TONE.INFO,
  [OIDC_PROVIDER_STATUS.DISABLED]: STATUS_TONE.NEUTRAL,
  [OIDC_PROVIDER_STATUS.RETIRED]: STATUS_TONE.NEUTRAL,
  [OIDC_PROVIDER_STATUS.FAILED]: STATUS_TONE.ERROR,
  [OIDC_PROVIDER_STATUS.RECOVERY]: STATUS_TONE.ERROR,
  [OIDC_PROVIDER_STATUS.COMPENSATED]: STATUS_TONE.WARNING,
  [OIDC_PROVIDER_STATUS.CONFIGURED]: STATUS_TONE.WARNING,
  [OIDC_PROVIDER_STATUS.PENDING]: STATUS_TONE.WARNING,
} as const satisfies Record<(typeof OIDC_PROVIDER_STATUS)[keyof typeof OIDC_PROVIDER_STATUS], string>;

export const AUTHENTICATION_STATE = {
  NO_MANAGED_OIDC: 'No OIDC provider managed here',
  ACTIVATION_REQUIRED: 'OIDC activation required',
  NO_ACTIVE_OIDC: 'No active OIDC provider',
  OIDC_ACTIVE: 'OIDC sign-in active',
} as const;

export const OIDC_PROVIDER_MESSAGE = {
  GRAFANA_SYNCHRONIZED: 'Grafana OAuth configuration synchronized.',
  CALLBACK_DESCRIPTION: 'Register this exact callback URL with the customer OIDC provider.',
  SECRET_REPLACEMENT_REQUIRED: 'Required only when changing the client ID or rotating the secret.',
  VALIDATED: 'OIDC provider settings are valid.',
  GRAFANA_SYNC_FAILED: ACCESS_ERROR.GRAFANA_SYNC_FAILED,
  RECOVERY_REQUIRED:
    'Grafana OAuth was disabled because the new configuration could not be safely rolled back. Retry synchronization after resolving the deployment issue.',
  ACTIVATION_COMPENSATED:
    'DevLake activation did not complete. Grafana was restored to its previous configuration; resolve the issue and activate again.',
} as const;

export const GRAFANA_PROVIDER_OPTIONS: Array<{ value: GrafanaProviderKind; label: string }> = [
  { value: GRAFANA_PROVIDER_KIND.GOOGLE, label: 'Google' },
  { value: GRAFANA_PROVIDER_KIND.AZURE_AD, label: 'Microsoft Entra ID' },
  { value: GRAFANA_PROVIDER_KIND.OKTA, label: 'Okta' },
  { value: GRAFANA_PROVIDER_KIND.GITLAB, label: 'GitLab' },
  { value: GRAFANA_PROVIDER_KIND.GENERIC_OAUTH, label: 'Generic OAuth' },
  { value: GRAFANA_PROVIDER_KIND.NONE, label: 'DevLake only' },
];

export const GRAFANA_PROVIDER_LABEL: Record<GrafanaProviderKind, string> = Object.fromEntries(
  GRAFANA_PROVIDER_OPTIONS.map((option) => [option.value, option.label]),
) as Record<GrafanaProviderKind, string>;

export const PROVIDER_ACTION = {
  ACTIVATE: 'activate',
  ENABLE: 'enable',
  DISABLE: 'disable',
  RETIRE: 'retire',
  GRAFANA_SYNC: 'grafana-sync',
  SELECT_GENERIC: 'select-generic',
} as const;

export const PROVIDER_COLUMN = {
  PROVIDER: 'provider',
  DEVLAKE: 'devlake',
  GRAFANA: 'grafana',
  ACTIONS: 'actions',
} as const;

export const COPY = {
  title: 'Authentication',
  description:
    "Grafana access remains independently managed. Providers marked DevLake only use Grafana's ordinary login.",
  sectionTitle: 'OIDC providers',
  tableLabel: 'OIDC providers',
  addProvider: 'Add provider',
  stateTooltip: 'Review the OIDC configuration managed in Users.',
  loadFailed: 'Authentication settings could not be loaded. Refresh the page and try again.',
  empty: {
    title: 'No OIDC providers yet',
    description: 'Add a provider to let people sign in with your identity provider.',
  },
  columns: { provider: 'Provider', devlake: 'DevLake', grafana: 'Grafana', actions: 'Actions' },
  selectedGenericOAuth: 'Selected Generic OAuth',
  grafanaOwnLogin: "Uses Grafana's own login",
  lastEnabled: 'At least one OIDC provider must remain enabled.',
  updated: 'OIDC provider updated.',
  saved: 'OIDC provider saved.',
  actions: {
    edit: 'Edit',
    activate: 'Activate',
    enable: 'Enable',
    disable: 'Disable',
    useInGrafana: 'Use in Grafana',
    retryGrafana: 'Retry Grafana',
    retire: 'Retire',
    labelFor: (action: string, name: string) => `${action} ${name}`,
  },
  callback: {
    missing: 'Deployment public URL is not configured.',
    copied: 'Callback URL copied.',
    copy: (label: string) => `Copy ${label}`,
    devlake: 'DevLake callback URL',
    grafana: 'Grafana callback URL',
  },
  editor: {
    addTitle: 'Add OIDC provider',
    editTitle: (name: string) => `Edit ${name}`,
    submit: 'Save provider',
    validate: 'Validate',
    disabledReason: 'Complete the required fields with valid values to save.',
    providerKey: {
      label: 'Provider key',
      description: 'Use a stable lowercase identifier. It cannot change after creation.',
      placeholder: 'google-workspace',
    },
    displayName: { label: 'Display name', placeholder: 'Google Workspace' },
    issuerUrl: { label: 'Issuer URL', placeholder: 'https://accounts.google.com' },
    clientId: { label: 'Client ID' },
    clientSecret: { label: 'Client secret' },
    scopes: { label: 'Scopes', description: 'The openid scope is required.' },
    grafanaTarget: {
      label: 'Grafana sign-in option',
      description: 'Only one DevLake provider can control each Grafana sign-in option.',
    },
    confirmDevlakeOnly: "I understand this provider is for DevLake only and opens Grafana's ordinary login.",
    stagedRevision: 'A staged revision is awaiting activation. The active provider remains in use until then.',
  },
  confirm: {
    activate: {
      tone: CONFIRM_TONE.DEFAULT,
      title: () => 'Activate OIDC provider?',
      description: (name: string) => `Activate ${name} for DevLake sign-in.`,
      confirm: 'Activate',
    },
    disable: {
      tone: CONFIRM_TONE.DANGER,
      title: () => 'Disable OIDC provider?',
      description: (name: string) =>
        `DevLake sign-in through ${name} will stop. Grafana access remains independently managed.`,
      confirm: 'Disable',
    },
    retire: {
      tone: CONFIRM_TONE.DANGER,
      title: () => 'Retire OIDC provider?',
      description: (name: string) =>
        `${name} will no longer be available for DevLake sign-in. This does not delete Grafana users.`,
      confirm: 'Retire',
    },
    selectGeneric: {
      tone: CONFIRM_TONE.DEFAULT,
      title: () => 'Select for Grafana Generic OAuth?',
      description: (name: string) =>
        `Grafana Generic OAuth will start using ${name}. This changes the /login/generic_oauth route.`,
      confirm: 'Switch Grafana',
    },
  },
};

export const PROVIDER_CONFIRM: Partial<Record<(typeof PROVIDER_ACTION)[keyof typeof PROVIDER_ACTION], ConfirmConfig>> =
  {
    [PROVIDER_ACTION.ACTIVATE]: COPY.confirm.activate,
    [PROVIDER_ACTION.DISABLE]: COPY.confirm.disable,
    [PROVIDER_ACTION.RETIRE]: COPY.confirm.retire,
    [PROVIDER_ACTION.SELECT_GENERIC]: COPY.confirm.selectGeneric,
  };
