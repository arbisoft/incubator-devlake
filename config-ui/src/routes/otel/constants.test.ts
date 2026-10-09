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

import { OTEL_BATCH_STATUS, OTEL_INGESTION_STATE, OTEL_STATUS } from '@/api/otel/constants';
import { CONFIRM_TONE } from '@/ui/confirm-modal/constants';
import { STATUS_TONE } from '@/ui/constants';

import { CONNECTION_STATE, COPY, LIFECYCLE_ACTION } from './constants';
import { BATCH_STATUS_TONE, CONNECTION_STATE_TONE, CREDENTIAL_TONE, INGESTION_STATE_TONE } from './tones';

const NAME = 'Platform';

describe('routes/otel/constants', () => {
  it('gives every lifecycle action a confirm that names the connection', () => {
    for (const action of Object.values(LIFECYCLE_ACTION)) {
      const confirm = COPY.confirm[action];
      expect(confirm.title(NAME)).toContain(NAME);
      expect(confirm.description(NAME)).toContain(NAME);
      expect(confirm.confirm).not.toBe('');
      expect(COPY.actions[action](NAME)).toContain(NAME);
      expect(COPY.done[action]).toBeDefined();
    }
  });

  it('marks only revoke and remove as dangerous', () => {
    const danger = Object.values(LIFECYCLE_ACTION).filter(
      (action) => COPY.confirm[action].tone === CONFIRM_TONE.DANGER,
    );
    expect(danger).toEqual([LIFECYCLE_ACTION.REVOKE, LIFECYCLE_ACTION.HIDE]);
  });

  it('maps every status to a label and a tone', () => {
    for (const status of Object.values(OTEL_STATUS)) {
      expect(COPY.credentialStatus[status]).toBeTruthy();
      expect(CREDENTIAL_TONE[status]).toBeTruthy();
    }
    for (const state of Object.values(CONNECTION_STATE)) {
      expect(COPY.state[state]).toBeTruthy();
      expect(CONNECTION_STATE_TONE[state]).toBeTruthy();
    }
    for (const state of Object.values(OTEL_INGESTION_STATE)) {
      expect(COPY.health.state[state]).toBeTruthy();
      expect(INGESTION_STATE_TONE[state]).toBeTruthy();
    }
    for (const status of Object.values(OTEL_BATCH_STATUS)) {
      expect(COPY.health.batchStatus[status]).toBeTruthy();
      expect(BATCH_STATUS_TONE[status]).toBeTruthy();
    }
  });

  it('shows the healthy, degraded and unhealthy states in distinct tones', () => {
    expect(INGESTION_STATE_TONE[OTEL_INGESTION_STATE.HEALTHY]).toBe(STATUS_TONE.SUCCESS);
    expect(INGESTION_STATE_TONE[OTEL_INGESTION_STATE.DEGRADED]).toBe(STATUS_TONE.WARNING);
    expect(INGESTION_STATE_TONE[OTEL_INGESTION_STATE.UNHEALTHY]).toBe(STATUS_TONE.ERROR);
    expect(CONNECTION_STATE_TONE[CONNECTION_STATE.REVOKED]).toBe(STATUS_TONE.NEUTRAL);
  });
});
