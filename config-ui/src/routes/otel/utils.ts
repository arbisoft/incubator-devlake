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

import { formatPlural } from '../../utils';
import { OTEL_ATTENTION_CHANGED_EVENT, OTEL_ERROR } from './constants';

const SAFE_LIFECYCLE_MESSAGE_STATUSES: readonly number[] = [HttpStatusCode.BadRequest];

type OtelErrorResponse = { message?: unknown };

export type OtelAttentionState = {
  connectionCount: number;
  restartRequired: number;
  recoveryRequired: number;
};

type AttentionTarget = {
  restartRequired?: boolean;
  recoveryRequired?: boolean;
};

export const getAttentionState = (connections: AttentionTarget[]): OtelAttentionState =>
  connections.reduce(
    (state, connection) => ({
      connectionCount: state.connectionCount + (connection.restartRequired || connection.recoveryRequired ? 1 : 0),
      restartRequired: state.restartRequired + (connection.restartRequired ? 1 : 0),
      recoveryRequired: state.recoveryRequired + (connection.recoveryRequired ? 1 : 0),
    }),
    { connectionCount: 0, restartRequired: 0, recoveryRequired: 0 },
  );

export const formatConnectionCount = (count: number) => formatPlural(count, 'connection');

export const withVerb = (count: number, singular: string, plural: string) =>
  `${formatConnectionCount(count)} ${count === 1 ? singular : plural}`;

export const isSameAttentionState = (left?: OtelAttentionState, right?: OtelAttentionState) =>
  left?.connectionCount === right?.connectionCount &&
  left?.restartRequired === right?.restartRequired &&
  left?.recoveryRequired === right?.recoveryRequired;

export const notifyOtelAttentionChanged = () => {
  window.dispatchEvent(new Event(OTEL_ATTENTION_CHANGED_EVENT));
};

// Surface only explicit validation messages; unexpected backend failures remain generic.
export const getOtelCreateError = (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === HttpStatusCode.ServiceUnavailable) {
    return OTEL_ERROR.CREDENTIAL_STORAGE;
  }
  if (!axios.isAxiosError<OtelErrorResponse>(error) || error.response?.status !== HttpStatusCode.BadRequest) {
    return OTEL_ERROR.CREATE;
  }

  const serverMessage = typeof error.response.data?.message === 'string' ? error.response.data.message : '';
  if (serverMessage.includes('a Claude Code OTel connection already exists for this team'))
    return OTEL_ERROR.DUPLICATE_TEAM;

  return serverMessage || OTEL_ERROR.CREATE;
};

// Surface only known operational responses; filesystem details and stack traces stay server-side.
export const getOtelLifecycleError = (error: unknown) => {
  if (!axios.isAxiosError<OtelErrorResponse>(error)) return OTEL_ERROR.LIFECYCLE;

  const { status, data } = error.response ?? {};
  if (status === HttpStatusCode.ServiceUnavailable) return OTEL_ERROR.CREDENTIAL_STORAGE;

  const serverMessage = typeof data?.message === 'string' ? data.message : '';
  if (status !== undefined && SAFE_LIFECYCLE_MESSAGE_STATUSES.includes(status)) {
    return serverMessage || OTEL_ERROR.LIFECYCLE;
  }

  return OTEL_ERROR.LIFECYCLE;
};
