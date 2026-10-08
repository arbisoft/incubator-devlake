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

import { OTEL_STATUS, type OtelConnectionResponse, type OtelIngestionStatus } from '@/api/otel';
import { METRIC_TILE_TONE, type MetricTileTone } from '@/ui/metric-tile';
import { toUserMessage } from '@/ui/utils';
import { formatPlural } from '@/utils/text';

import {
  CONNECTION_STATE,
  APPLY_ERROR_MAP,
  COPY,
  CREATE_ERROR_MAP,
  CREATE_INTENT_PARAM,
  LIFECYCLE_ACTION,
  LIFECYCLE_ERROR_MAP,
  OTEL_ATTENTION_CHANGED_EVENT,
  PROJECT_ERROR_MAP,
  RESTART_HINT_MARKER,
  SECONDS_PER_MINUTE,
} from './constants';
import type { ConnectionState, LifecycleAction, OtelAttentionState } from './types';

const HEALTH_THRESHOLD = {
  DEGRADED_BACKLOG_SECONDS: 5 * SECONDS_PER_MINUTE,
  UNHEALTHY_BACKLOG_SECONDS: 30 * SECONDS_PER_MINUTE,
  UNHEALTHY_PERMANENT_ERRORS: 5,
} as const;

type AttentionTarget = {
  restartRequired?: boolean;
  recoveryRequired?: boolean;
};

type OtelConnectionStatusTarget = Pick<OtelConnectionResponse, 'recoveryRequired' | 'restartRequired'> & {
  connection: Pick<OtelConnectionResponse['connection'], 'status'>;
};

type ActionTarget = Pick<OtelConnectionResponse, 'recoveryRequired' | 'restartRequired'> & {
  connection: Pick<OtelConnectionResponse['connection'], 'status'>;
  credentials: readonly { status: string }[];
};

const hasCredentialStatus = ({ credentials }: Pick<ActionTarget, 'credentials'>, status: string) =>
  credentials.some((credential) => credential.status === status);

const ACTION_ALLOWED: Record<LifecycleAction, (target: ActionTarget) => boolean> = {
  [LIFECYCLE_ACTION.ROTATE]: (target) =>
    target.connection.status === OTEL_STATUS.ACTIVE &&
    !target.recoveryRequired &&
    !hasCredentialStatus(target, OTEL_STATUS.RETIRING),
  [LIFECYCLE_ACTION.APPLY]: (target) => target.restartRequired,
  [LIFECYCLE_ACTION.FINALIZE]: (target) => hasCredentialStatus(target, OTEL_STATUS.RETIRING),
  [LIFECYCLE_ACTION.REVOKE]: (target) => target.connection.status === OTEL_STATUS.ACTIVE,
  [LIFECYCLE_ACTION.HIDE]: (target) => target.connection.status === OTEL_STATUS.REVOKED,
};

export const isActionAllowed = (action: LifecycleAction, target: ActionTarget) => ACTION_ALLOWED[action](target);

export const getAttentionState = (connections: AttentionTarget[]): OtelAttentionState =>
  connections.reduce(
    (state, connection) => ({
      connectionsNeedingAttention:
        state.connectionsNeedingAttention + (connection.restartRequired || connection.recoveryRequired ? 1 : 0),
      restartRequired: state.restartRequired + (connection.restartRequired ? 1 : 0),
      recoveryRequired: state.recoveryRequired + (connection.recoveryRequired ? 1 : 0),
    }),
    { connectionsNeedingAttention: 0, restartRequired: 0, recoveryRequired: 0 },
  );

export const isSameAttentionState = (left?: OtelAttentionState, right?: OtelAttentionState) =>
  left?.connectionsNeedingAttention === right?.connectionsNeedingAttention &&
  left?.restartRequired === right?.restartRequired &&
  left?.recoveryRequired === right?.recoveryRequired;

export const hasRecoveryRequired = (connections: readonly { recoveryRequired?: boolean }[]) =>
  connections.some((connection) => Boolean(connection.recoveryRequired));

export const hasStorageNeedsApplying = (connections: readonly { storageNeedsApplying?: boolean }[]) =>
  connections.some((connection) => Boolean(connection.storageNeedsApplying));

export const getOtelConnectionStatus = ({
  connection,
  recoveryRequired,
  restartRequired,
}: OtelConnectionStatusTarget): ConnectionState => {
  if (connection.status === OTEL_STATUS.REVOKED) return CONNECTION_STATE.REVOKED;
  if (restartRequired || recoveryRequired) return CONNECTION_STATE.ACTION_REQUIRED;
  return CONNECTION_STATE.READY;
};

export const getAttentionDescription = (attention: OtelAttentionState): string => {
  const copy = COPY.attention;
  const details: string[] = [];
  if (attention.recoveryRequired > 0) {
    details.push(copy.recoveryDetail(formatPlural(attention.recoveryRequired, 'connection')));
  }
  if (attention.restartRequired > 0) {
    details.push(copy.restartDetail(formatPlural(attention.restartRequired, 'connection')));
  }

  const verb = attention.connectionsNeedingAttention === 1 ? copy.needsAttention : copy.needAttention;
  const parts = [
    copy.summary(formatPlural(attention.connectionsNeedingAttention, 'connection'), verb, details.join('; ')),
  ];
  if (attention.recoveryRequired > 0) parts.push(copy.recoveryAdvice);
  if (attention.restartRequired > 0) parts.push(copy.restartAdvice);
  return parts.join(' ');
};

export const notifyOtelAttentionChanged = () => {
  window.dispatchEvent(new Event(OTEL_ATTENTION_CHANGED_EVENT));
};

export const formatAge = (seconds?: number) => {
  if (seconds === undefined) return COPY.health.none;
  return seconds < SECONDS_PER_MINUTE
    ? COPY.health.seconds(seconds)
    : COPY.health.minutes(Math.floor(seconds / SECONDS_PER_MINUTE));
};

export const getBacklogTone = (seconds?: number): MetricTileTone => {
  if (seconds === undefined) return METRIC_TILE_TONE.DEFAULT;
  if (seconds >= HEALTH_THRESHOLD.UNHEALTHY_BACKLOG_SECONDS) return METRIC_TILE_TONE.DANGER;
  return seconds >= HEALTH_THRESHOLD.DEGRADED_BACKLOG_SECONDS ? METRIC_TILE_TONE.WARNING : METRIC_TILE_TONE.DEFAULT;
};

export const getPermanentErrorTone = (count: number): MetricTileTone => {
  if (count >= HEALTH_THRESHOLD.UNHEALTHY_PERMANENT_ERRORS) return METRIC_TILE_TONE.DANGER;
  return count > 0 ? METRIC_TILE_TONE.WARNING : METRIC_TILE_TONE.DEFAULT;
};

export const getConverterLabel = ({ converterLease }: Pick<OtelIngestionStatus, 'converterLease'>) => {
  if (!converterLease) return COPY.health.converter.unavailable;
  return converterLease.active ? COPY.health.converter.active : COPY.health.converter.expired;
};

export const getOtelCreateError = (error: unknown) => toUserMessage(error, CREATE_ERROR_MAP, COPY.errors.create);

export const getOtelProjectError = (error: unknown) => toUserMessage(error, PROJECT_ERROR_MAP, COPY.errors.projects);

export const getOtelLifecycleError = (error: unknown) =>
  toUserMessage(error, LIFECYCLE_ERROR_MAP, COPY.errors.lifecycle);

export const getOtelApplyError = (response: Pick<OtelConnectionResponse, 'restartHint'>) => {
  const hint = response.restartHint?.toLowerCase() ?? '';
  let status: HttpStatusCode | undefined;
  if (hint.includes(RESTART_HINT_MARKER.COOLDOWN)) status = HttpStatusCode.TooManyRequests;
  else if (hint.includes(RESTART_HINT_MARKER.IN_PROGRESS)) status = HttpStatusCode.Conflict;
  return toUserMessage({ response: { status } }, APPLY_ERROR_MAP, COPY.errors.apply);
};

export const getCreateIntent = (params: URLSearchParams) => {
  const projectName = params.get(CREATE_INTENT_PARAM.PROJECT);
  return params.get(CREATE_INTENT_PARAM.CREATE) === 'true' && projectName ? projectName : undefined;
};
