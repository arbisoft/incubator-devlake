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

import { OTEL_STATUS } from '@/api/otel/constants';
import { COMMON_COPY, METRIC_TILE_TONE } from '@/ui';

import { CONNECTION_STATE, COPY, LIFECYCLE_ACTION } from './constants';
import {
  formatAge,
  getBacklogTone,
  getPermanentErrorTone,
  getAttentionDescription,
  getAttentionState,
  getConverterLabel,
  getOtelConnectionStatus,
  getOtelCreateError,
  getOtelApplyError,
  getOtelLifecycleError,
  getOtelProjectError,
  hasRecoveryRequired,
  hasStorageNeedsApplying,
  isActionAllowed,
  isSameAttentionState,
} from './utils';

const createAxiosError = (status: number, data: unknown) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: status === HttpStatusCode.BadRequest ? 'Bad Request' : 'Internal Server Error',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  });

const credential = (status: string) => ({ status });

const target = (overrides: Partial<Parameters<typeof isActionAllowed>[1]> = {}) => ({
  connection: { status: OTEL_STATUS.ACTIVE },
  credentials: [credential(OTEL_STATUS.ACTIVE)],
  restartRequired: false,
  recoveryRequired: false,
  ...overrides,
});

describe('routes/otel/utils', () => {
  it('surfaces only safe project-placement validation errors', () => {
    const validationError = createAxiosError(HttpStatusCode.BadRequest, {
      message: 'project "alpha" does not exist',
    });
    expect(getOtelProjectError(validationError)).toBe(COPY.errors.projectsValidation);

    const unexpectedError = createAxiosError(HttpStatusCode.InternalServerError, {
      message: 'internal database error',
    });
    expect(getOtelProjectError(unexpectedError)).toBe(COPY.errors.projects);
    expect(getOtelProjectError(new Error('network error'))).toBe(COPY.errors.projects);
  });

  it('maps create failures to safe copy', () => {
    const duplicate = createAxiosError(HttpStatusCode.Conflict, {
      message: 'a Claude Code OTel connection already exists for this team',
    });
    expect(getOtelCreateError(duplicate)).toBe(COPY.errors.duplicateTeam);
    expect(getOtelCreateError(createAxiosError(HttpStatusCode.BadRequest, { message: 'internal details' }))).toBe(
      COPY.errors.createValidation,
    );
    expect(
      getOtelCreateError(createAxiosError(HttpStatusCode.Conflict, { message: 'internal conflict details' })),
    ).toBe(COPY.errors.duplicateTeam);
    expect(getOtelCreateError(createAxiosError(HttpStatusCode.ServiceUnavailable, { message: 'htpasswd' }))).toBe(
      COPY.errors.credentialStorage,
    );
    expect(getOtelCreateError(createAxiosError(HttpStatusCode.InternalServerError, { message: 'sql: boom' }))).toBe(
      COPY.errors.create,
    );
  });

  it('maps lifecycle failures to safe copy', () => {
    expect(getOtelLifecycleError(createAxiosError(HttpStatusCode.ServiceUnavailable, {}))).toBe(
      COPY.errors.credentialStorage,
    );
    expect(
      getOtelLifecycleError(createAxiosError(HttpStatusCode.BadRequest, { message: 'connection is revoked' })),
    ).toBe(COPY.errors.lifecycle);
    expect(
      getOtelLifecycleError(createAxiosError(HttpStatusCode.Conflict, { message: 'internal conflict details' })),
    ).toBe(COPY.errors.lifecycleConflict);
    expect(
      getOtelLifecycleError(createAxiosError(HttpStatusCode.InternalServerError, { message: '/etc/htpasswd' })),
    ).toBe(COPY.errors.lifecycle);
    expect(getOtelLifecycleError(new Error('offline'))).toBe(COPY.errors.lifecycle);
    expect(COPY.errors.lifecycle).not.toBe(COMMON_COPY.genericError);
  });

  it('maps restart hints to safe cooldown copy', () => {
    expect(getOtelApplyError({ restartHint: 'Collector is cooling down. Retry Apply in about 9 seconds.' })).toBe(
      COPY.errors.applyCooldown,
    );
    expect(getOtelApplyError({ restartHint: 'Collector restart is already in progress.' })).toBe(
      COPY.errors.applyInProgress,
    );
    expect(getOtelApplyError({ restartHint: 'internal helper details /etc/secret' })).toBe(COPY.errors.apply);
  });

  it('derives a consistent OTel connection display state', () => {
    const ready = { connection: { status: OTEL_STATUS.ACTIVE }, restartRequired: false, recoveryRequired: false };
    expect(getOtelConnectionStatus(ready)).toBe(CONNECTION_STATE.READY);
    expect(getOtelConnectionStatus({ ...ready, recoveryRequired: true })).toBe(CONNECTION_STATE.ACTION_REQUIRED);
    expect(getOtelConnectionStatus({ ...ready, restartRequired: true })).toBe(CONNECTION_STATE.ACTION_REQUIRED);
    expect(getOtelConnectionStatus({ ...ready, connection: { status: OTEL_STATUS.REVOKED } })).toBe(
      CONNECTION_STATE.REVOKED,
    );
  });

  it('counts the connections that need attention', () => {
    const state = getAttentionState([
      { restartRequired: true },
      { recoveryRequired: true },
      { restartRequired: true, recoveryRequired: true },
      {},
    ]);
    expect(state).toEqual({ connectionsNeedingAttention: 3, restartRequired: 2, recoveryRequired: 2 });
    expect(isSameAttentionState(state, { ...state })).toBe(true);
    expect(isSameAttentionState(state, { ...state, restartRequired: 1 })).toBe(false);
    expect(isSameAttentionState(undefined, state)).toBe(false);
  });

  it('describes what needs attention and what to do', () => {
    expect(getAttentionDescription({ connectionsNeedingAttention: 1, restartRequired: 1, recoveryRequired: 0 })).toBe(
      `1 connection needs attention: 1 connection with pending credential changes. ${COPY.attention.restartAdvice}`,
    );
    const both = getAttentionDescription({ connectionsNeedingAttention: 2, restartRequired: 1, recoveryRequired: 1 });
    expect(both).toContain('2 connections need attention');
    expect(both).toContain(COPY.attention.recoveryAdvice);
    expect(both).toContain(COPY.attention.restartAdvice);
  });

  it('flags storage recovery and pending applies across connections', () => {
    expect(hasRecoveryRequired([{}, { recoveryRequired: true }])).toBe(true);
    expect(hasRecoveryRequired([{}])).toBe(false);
    expect(hasStorageNeedsApplying([{ storageNeedsApplying: true }])).toBe(true);
    expect(hasStorageNeedsApplying([])).toBe(false);
  });

  it('allows each lifecycle action only in the states that need it', () => {
    const active = target();
    expect(isActionAllowed(LIFECYCLE_ACTION.ROTATE, active)).toBe(true);
    expect(isActionAllowed(LIFECYCLE_ACTION.REVOKE, active)).toBe(true);
    expect(isActionAllowed(LIFECYCLE_ACTION.APPLY, active)).toBe(false);
    expect(isActionAllowed(LIFECYCLE_ACTION.FINALIZE, active)).toBe(false);
    expect(isActionAllowed(LIFECYCLE_ACTION.HIDE, active)).toBe(false);

    const retiring = target({ credentials: [credential(OTEL_STATUS.ACTIVE), credential(OTEL_STATUS.RETIRING)] });
    expect(isActionAllowed(LIFECYCLE_ACTION.FINALIZE, retiring)).toBe(true);
    expect(isActionAllowed(LIFECYCLE_ACTION.ROTATE, retiring)).toBe(false);

    expect(isActionAllowed(LIFECYCLE_ACTION.APPLY, target({ restartRequired: true }))).toBe(true);
    expect(isActionAllowed(LIFECYCLE_ACTION.ROTATE, target({ recoveryRequired: true }))).toBe(false);

    const revoked = target({ connection: { status: OTEL_STATUS.REVOKED } });
    expect(isActionAllowed(LIFECYCLE_ACTION.HIDE, revoked)).toBe(true);
    expect(isActionAllowed(LIFECYCLE_ACTION.REVOKE, revoked)).toBe(false);
    expect(isActionAllowed(LIFECYCLE_ACTION.ROTATE, revoked)).toBe(false);
  });

  it('formats the backlog age and the converter state', () => {
    expect(formatAge(undefined)).toBe(COPY.health.none);
    expect(formatAge(45)).toBe('45s');
    expect(formatAge(310)).toBe('5m');
    expect(getConverterLabel({})).toBe(COPY.health.converter.unavailable);
    const lease = { leaseUntil: '', updatedAt: '', ageSeconds: 0 };
    expect(getConverterLabel({ converterLease: { ...lease, active: true } })).toBe(COPY.health.converter.active);
    expect(getConverterLabel({ converterLease: { ...lease, active: false } })).toBe(COPY.health.converter.expired);
  });

  it('tones the backlog age and the permanent errors at the backend health thresholds', () => {
    expect(getBacklogTone(undefined)).toBe(METRIC_TILE_TONE.DEFAULT);
    expect(getBacklogTone(299)).toBe(METRIC_TILE_TONE.DEFAULT);
    expect(getBacklogTone(300)).toBe(METRIC_TILE_TONE.WARNING);
    expect(getBacklogTone(1800)).toBe(METRIC_TILE_TONE.DANGER);
    expect(getPermanentErrorTone(0)).toBe(METRIC_TILE_TONE.DEFAULT);
    expect(getPermanentErrorTone(1)).toBe(METRIC_TILE_TONE.WARNING);
    expect(getPermanentErrorTone(5)).toBe(METRIC_TILE_TONE.DANGER);
  });
});
