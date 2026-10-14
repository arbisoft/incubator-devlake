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
import { IConnectionStatus, type IConnection } from '@/types';
import { CONNECTION_HEALTH_STATE, toUserMessage, type ConnectionHealthProps } from '@/ui';

import {
  CREDENTIAL_MESSAGE,
  ERROR_DUMP_MARKER,
  ERROR_DUMP_NOISE,
  ERROR_DUMP_SUMMARY,
  HEALTH_FAILURE_REASON,
  HEALTH_STORAGE_KEY,
  HEALTH_TTL_MS,
  MESSAGE_MAX_LENGTH,
  REJECTED_STATUSES,
  TEST_ERROR_MAP,
  UNREACHABLE_MESSAGE,
  UNREACHABLE_STATUSES,
  COPY,
  HTTP_STATUS,
} from './constants';
import type { ConnectionHealthEntry, ConnectionHealthMap, HealthFailureReason, TestFailureInput } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const asString = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined);

export const toTestFailureInput = (error: unknown): TestFailureInput => {
  if (!isRecord(error)) return {};
  const response = isRecord(error.response) ? error.response : undefined;
  const data = response && isRecord(response.data) ? response.data : undefined;
  return {
    status: typeof response?.status === 'number' ? response.status : undefined,
    message: asString(data?.message) ?? asString(error.message),
  };
};

// Status is the HTTP status of the test request; it is undefined when no response came back.
export const classifyTestFailure = ({ status, message = '' }: TestFailureInput): HealthFailureReason => {
  if (status !== undefined && REJECTED_STATUSES.includes(status)) return HEALTH_FAILURE_REASON.CREDENTIALS;
  if (status === undefined || UNREACHABLE_STATUSES.includes(status)) return HEALTH_FAILURE_REASON.UNREACHABLE;
  if (CREDENTIAL_MESSAGE.test(message)) return HEALTH_FAILURE_REASON.CREDENTIALS;
  if (UNREACHABLE_MESSAGE.test(message)) return HEALTH_FAILURE_REASON.UNREACHABLE;
  return HEALTH_FAILURE_REASON.FAILED;
};

// A raw Go error dump is reduced to its first readable line so no stack trace reaches a tooltip.
export const cleanTestMessage = (raw: string | undefined) => {
  if (!raw) return undefined;
  const lines = raw.split('\n').map((line) => line.trim());
  const summary = raw.includes(ERROR_DUMP_MARKER)
    ? lines.map((line) => ERROR_DUMP_SUMMARY.exec(line)?.[1]).find((text) => text && text !== ERROR_DUMP_NOISE)
    : lines.find(Boolean);
  return summary?.slice(0, MESSAGE_MAX_LENGTH);
};

export const failureLabel = (reason: HealthFailureReason) => COPY.failure[reason];

export const healthFromTestResult = (
  result: { success: boolean; message?: string },
  testedAt: number,
): ConnectionHealthEntry =>
  result.success
    ? { status: IConnectionStatus.ONLINE, message: cleanTestMessage(result.message), testedAt }
    : {
        status: IConnectionStatus.OFFLINE,
        reason: classifyTestFailure({ status: HTTP_STATUS.OK, message: result.message }),
        message: cleanTestMessage(result.message),
        testedAt,
      };

export const healthFromTestError = (error: unknown, testedAt: number): ConnectionHealthEntry => {
  const input = toTestFailureInput(error);
  return {
    status: IConnectionStatus.OFFLINE,
    reason: classifyTestFailure(input),
    message: cleanTestMessage(input.message),
    testedAt,
  };
};

export const isHealthFresh = (entry: ConnectionHealthEntry | undefined, now: number) =>
  entry !== undefined && now - entry.testedAt < HEALTH_TTL_MS;

export const findStaleConnections = (connections: IConnection[], health: ConnectionHealthMap, now: number) =>
  connections.filter((connection) => !isHealthFresh(health[connection.unique], now));

const isEntry = (value: unknown): value is ConnectionHealthEntry =>
  isRecord(value) &&
  typeof value.testedAt === 'number' &&
  (value.status === IConnectionStatus.ONLINE || value.status === IConnectionStatus.OFFLINE);

export const hydrateHealth = (raw: unknown, now: number): ConnectionHealthMap => {
  if (!isRecord(raw)) return {};
  const fresh: ConnectionHealthMap = {};
  for (const [unique, entry] of Object.entries(raw)) {
    if (isEntry(entry) && isHealthFresh(entry, now)) fresh[unique] = entry;
  }
  return fresh;
};

export const readStoredHealth = (now: number = Date.now()): ConnectionHealthMap => {
  try {
    const raw = window.sessionStorage.getItem(HEALTH_STORAGE_KEY);
    return raw ? hydrateHealth(JSON.parse(raw), now) : {};
  } catch {
    return {};
  }
};

export const writeStoredHealth = (health: ConnectionHealthMap) => {
  try {
    window.sessionStorage.setItem(HEALTH_STORAGE_KEY, JSON.stringify(health));
  } catch {
    // storage may be blocked; health then lives in memory for this page only
  }
};

export const countFailed = (connections: IConnection[], health: ConnectionHealthMap) =>
  connections.filter((connection) => health[connection.unique]?.status === IConnectionStatus.OFFLINE).length;

type HealthView = Pick<ConnectionHealthProps, 'state' | 'testedAt' | 'label' | 'message'>;

export const toHealthView = (entry: ConnectionHealthEntry | undefined): HealthView => {
  if (!entry) return { state: CONNECTION_HEALTH_STATE.UNKNOWN };
  const { status, reason, message, testedAt } = entry;
  if (status === IConnectionStatus.ONLINE) return { state: CONNECTION_HEALTH_STATE.ONLINE, testedAt, message };
  return {
    state: CONNECTION_HEALTH_STATE.OFFLINE,
    testedAt,
    label: reason && failureLabel(reason),
    message,
  };
};

export const toTestErrorMessage = (error: unknown) => toUserMessage(error, TEST_ERROR_MAP, COPY.testFailed.fallback);
