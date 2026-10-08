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

import { HttpStatusCode } from 'axios';

import { OTEL_BATCH_STATUS, OTEL_INGESTION_STATE, OTEL_STATUS } from '@/api/otel/constants';
import { CONFIRM_TONE } from '@/ui/confirm-modal/constants';
import type { ConfirmConfig } from '@/ui/types';

export const OTEL_ATTENTION_CHANGED_EVENT = 'devlake:otel-attention-changed';
export const OTEL_REFRESH_INTERVAL_MS = 30_000;
export const OTEL_VISIBILITY_THROTTLE_MS = 10_000;
export const PROJECT_CHIP_LIMIT = 3;
export const BATCH_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const [DEFAULT_BATCH_PAGE_SIZE] = BATCH_PAGE_SIZE_OPTIONS;
export const SECONDS_PER_MINUTE = 60;
export const PREFERRED_SOURCE = 'otel';

export const RESTART_HINT_MARKER = { COOLDOWN: 'cooling down', IN_PROGRESS: 'already in progress' } as const;

export const CREATE_INTENT_PARAM = { CREATE: 'create', PROJECT: 'project' } as const;

export const CONNECTION_STATE = { READY: 'ready', ACTION_REQUIRED: 'actionRequired', REVOKED: 'revoked' } as const;

export const LIFECYCLE_ACTION = {
  ROTATE: 'rotate',
  REVOKE: 'revoke',
  HIDE: 'hide',
  FINALIZE: 'finalize',
  APPLY: 'apply',
} as const;

export const CONNECTION_COLUMN = {
  TEAM: 'team',
  PROJECTS: 'projects',
  ORGANIZATION: 'organization',
  ENDPOINT: 'endpoint',
  STATUS: 'status',
  CREDENTIALS: 'credentials',
  UPDATED: 'updated',
  ACTIONS: 'actions',
} as const;

export const BATCH_COLUMN = {
  RECEIVED: 'received',
  STATUS: 'status',
  DATAPOINTS: 'datapoints',
  ACTIONS: 'actions',
} as const;
export const POLICY_COLUMN = { WORKSPACE: 'workspace', FAMILY: 'family', SOURCE: 'source' } as const;

export const OTEL_MODAL = { CREATE: 'create', PROJECTS: 'projects' } as const;

export const COPY = {
  title: 'Claude Code OTel',
  description: 'Generate and manage the Basic Auth credential used by Claude Code telemetry.',
  breadcrumbConnections: 'Connections',
  generate: 'Generate Claude Settings',
  projectOptionsUnavailable: 'DevLake projects could not be loaded.',
  notices: {
    recovery:
      'The Collector credential verifier is unavailable. Revoke the affected connection, then generate new Claude settings to restore telemetry.',
    storage:
      'Credential storage differs from the registered credentials. Select Apply to reconcile the telemetry endpoint.',
  },
  connections: {
    title: 'Connections',
    tableLabel: 'Claude Code OTel connections',
    scrollHint: 'Scroll horizontally to see every connection detail and action.',
    empty: {
      title: 'No Claude Code OTel connections yet',
      description: 'Generate Claude settings to create a connection and its telemetry credential.',
    },
    columns: {
      team: 'Team',
      projects: 'Projects',
      organization: 'Anthropic organization',
      endpoint: 'Endpoint',
      status: 'Status',
      credentials: 'Credentials',
      updated: 'Updated',
      actions: 'Actions',
    },
  },
  state: {
    [CONNECTION_STATE.READY]: 'Ready',
    [CONNECTION_STATE.ACTION_REQUIRED]: 'Action required',
    [CONNECTION_STATE.REVOKED]: 'Revoked',
  },
  credentialStatus: {
    [OTEL_STATUS.ACTIVE]: 'Active',
    [OTEL_STATUS.RETIRING]: 'Retiring',
    [OTEL_STATUS.REVOKED]: 'Revoked',
  },
  placement: {
    unassigned: 'Unassigned',
    unassignedHelp: 'Use Projects to assign this connection to a DevLake project.',
    shared: 'Shared',
    more: (count: number) => `+${count} more`,
  },
  organization: {
    pending: 'Pending first telemetry',
    pendingHelp: 'This connection binds to the first Anthropic organization UUID it receives.',
    boundHelp: 'Telemetry for a different Anthropic organization requires a separate connection and credential.',
    createNotice:
      'This connection binds to the first Anthropic organization UUID it receives. Use a separate connection and credential for another organization.',
  },
  actions: {
    projects: (name: string) => `Manage projects for ${name}`,
    [LIFECYCLE_ACTION.ROTATE]: (name: string) => `Rotate credential for ${name}`,
    [LIFECYCLE_ACTION.APPLY]: (name: string) => `Apply credential changes for ${name}`,
    [LIFECYCLE_ACTION.FINALIZE]: (name: string) => `Finalize rotation for ${name}`,
    [LIFECYCLE_ACTION.REVOKE]: (name: string) => `Revoke credential for ${name}`,
    [LIFECYCLE_ACTION.HIDE]: (name: string) => `Remove connection for ${name}`,
  },
  confirm: {
    [LIFECYCLE_ACTION.ROTATE]: {
      tone: CONFIRM_TONE.DEFAULT,
      title: (name: string) => `Rotate the credential for ${name}?`,
      description: (name: string) =>
        `A new credential is generated for ${name}. The old credential stays valid as retiring until you finalize rotation.`,
      confirm: 'Rotate',
    },
    [LIFECYCLE_ACTION.FINALIZE]: {
      tone: CONFIRM_TONE.DEFAULT,
      title: (name: string) => `Finalize rotation for ${name}?`,
      description: (name: string) =>
        `Retiring credentials for ${name} are removed after the telemetry endpoint applies the update.`,
      confirm: 'Finalize',
    },
    [LIFECYCLE_ACTION.APPLY]: {
      tone: CONFIRM_TONE.DEFAULT,
      title: (name: string) => `Apply credential changes for ${name}?`,
      description: (name: string) =>
        `Retry applying the current credential state of ${name} to the telemetry endpoint.`,
      confirm: 'Apply',
    },
    [LIFECYCLE_ACTION.REVOKE]: {
      tone: CONFIRM_TONE.DANGER,
      title: (name: string) => `Revoke the credential for ${name}?`,
      description: (name: string) =>
        `All active Claude Code telemetry credentials for ${name} are rejected after the telemetry endpoint applies the update.`,
      confirm: 'Revoke',
    },
    [LIFECYCLE_ACTION.HIDE]: {
      tone: CONFIRM_TONE.DANGER,
      title: (name: string) => `Remove the revoked connection ${name}?`,
      description: (name: string) =>
        `This removes ${name} from this page. Its credential history remains retained in DevLake for audit purposes.`,
      confirm: 'Remove',
    },
  } satisfies Record<(typeof LIFECYCLE_ACTION)[keyof typeof LIFECYCLE_ACTION], ConfirmConfig>,
  done: {
    [LIFECYCLE_ACTION.ROTATE]: (name: string) => `Credential rotated for ${name}.`,
    [LIFECYCLE_ACTION.FINALIZE]: (name: string) => `Rotation finalized for ${name}.`,
    [LIFECYCLE_ACTION.APPLY]: (name: string) => `Credential changes applied for ${name}.`,
    [LIFECYCLE_ACTION.REVOKE]: (name: string) => `Credential revoked for ${name}.`,
    [LIFECYCLE_ACTION.HIDE]: (name: string) => `${name} removed.`,
  },
  policy: {
    title: 'Canonical daily data',
    description: 'Metric families for which OTel is the preferred source.',
    unavailable: 'Source policy is unavailable.',
    tableLabel: 'Canonical daily data sources',
    empty: {
      title: 'No OTel-preferred metric families yet',
      description: 'They appear after the first telemetry arrives.',
    },
    columns: { workspace: 'Workspace', family: 'Metric family', source: 'Preferred source' },
  },
  health: {
    title: 'Telemetry ingestion',
    tableLabel: 'Recent telemetry batches',
    batchesTitle: 'Recent batches',
    loading: 'Loading ingestion status...',
    unavailable: 'Ingestion status is unavailable.',
    retry: 'Retry',
    state: {
      [OTEL_INGESTION_STATE.HEALTHY]: 'Healthy',
      [OTEL_INGESTION_STATE.DEGRADED]: 'Degraded',
      [OTEL_INGESTION_STATE.UNHEALTHY]: 'Unhealthy',
    },
    metrics: {
      pending: 'Pending',
      retrying: 'Retrying',
      oldestBacklog: 'Oldest backlog',
      permanentErrors: 'Permanent errors (24h)',
      converter: 'Converter',
    },
    converter: { unavailable: 'Unavailable', active: 'Active', expired: 'Lease expired' },
    none: 'None',
    seconds: (value: number) => `${value}s`,
    minutes: (value: number) => `${value}m`,
    batchStatus: {
      [OTEL_BATCH_STATUS.PENDING]: 'Pending',
      [OTEL_BATCH_STATUS.PROCESSING]: 'Processing',
      [OTEL_BATCH_STATUS.PROCESSED]: 'Processed',
      [OTEL_BATCH_STATUS.RETRYABLE_ERROR]: 'Retrying',
      [OTEL_BATCH_STATUS.PERMANENT_ERROR]: 'Permanent error',
    },
    columns: { received: 'Received', status: 'Status', datapoints: 'Datapoints', actions: 'Actions' },
    emptyBatches: {
      title: 'No telemetry batches yet',
      description: 'Batches appear here as Claude Code sends telemetry.',
    },
    viewPayload: 'View payload',
    viewPayloadFor: (time: string) => `View payload for the batch received ${time}`,
    payloadTitle: 'OTLP payload',
    payloadCopy: 'Copy payload',
    payloadError: 'Unable to load the telemetry payload.',
    payloadRetry: 'Retry loading payload',
  },
  attention: {
    region: 'Claude Code telemetry attention',
    title: 'Claude Code telemetry needs attention.',
    manage: 'Manage Claude Code OTel',
    recoveryDetail: (connections: string) => `${connections} requiring credential storage recovery`,
    restartDetail: (connections: string) => `${connections} with pending credential changes`,
    summary: (connections: string, verb: string, details: string) => `${connections} ${verb}: ${details}.`,
    needsAttention: 'needs attention',
    needAttention: 'need attention',
    recoveryAdvice: 'Revoke affected connections and generate new Claude settings to restore telemetry.',
    restartAdvice: 'Open Claude Code OTel to apply pending credential changes.',
  },
  errors: {
    duplicateTeam:
      'Claude Code OTel credentials already exist for this team. Revoke them before generating new settings.',
    create: 'Unable to generate Claude settings. Please try again or contact support.',
    createValidation: 'Check the team name and project selection, then try again.',
    credentialStorage: 'Telemetry credential storage is temporarily unavailable. Please retry shortly.',
    lifecycle: 'Unable to update Claude Code OTel credentials. Please try again or contact support.',
    projects: 'Unable to update Claude Code OTel project placements. Please try again or contact support.',
    projectsValidation: 'Check the selected projects and try again.',
    lifecycleConflict: 'This connection changed before the action completed. Refresh the page and try again.',
    applyCooldown: 'The telemetry endpoint restarted recently. Retry Apply shortly.',
    applyInProgress: 'A telemetry endpoint restart is already in progress. Retry Apply shortly.',
    apply: 'Credential changes were saved, but the telemetry endpoint could not apply them. Retry Apply shortly.',
  },
};

const STORAGE_ERROR_MAP: Record<string, string> = {
  [HttpStatusCode.ServiceUnavailable]: COPY.errors.credentialStorage,
};

export const CREATE_ERROR_MAP: Record<string, string> = {
  [HttpStatusCode.BadRequest]: COPY.errors.createValidation,
  [HttpStatusCode.Conflict]: COPY.errors.duplicateTeam,
  ...STORAGE_ERROR_MAP,
};

export const PROJECT_ERROR_MAP: Record<string, string> = {
  [HttpStatusCode.BadRequest]: COPY.errors.projectsValidation,
  [HttpStatusCode.Conflict]: COPY.errors.projects,
  ...STORAGE_ERROR_MAP,
};

export const LIFECYCLE_ERROR_MAP: Record<string, string> = {
  [HttpStatusCode.BadRequest]: COPY.errors.lifecycle,
  [HttpStatusCode.Conflict]: COPY.errors.lifecycleConflict,
  ...STORAGE_ERROR_MAP,
};

export const APPLY_ERROR_MAP: Record<string, string> = {
  ...LIFECYCLE_ERROR_MAP,
  [HttpStatusCode.TooManyRequests]: COPY.errors.applyCooldown,
  [HttpStatusCode.Conflict]: COPY.errors.applyInProgress,
};
