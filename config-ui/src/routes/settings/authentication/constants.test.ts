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

import { STATUS_TONE } from '@/ui';

import {
  AUTHENTICATION_STATE,
  AUTHENTICATION_STATE_TONE,
  OIDC_PROVIDER_STATUS,
  OIDC_PROVIDER_STATUS_TONE,
  PROVIDER_ACTION,
  PROVIDER_CONFIRM,
} from './constants';

describe('OIDC provider status tones', () => {
  it('maps every provider status to a status tone', () => {
    expect(Object.keys(OIDC_PROVIDER_STATUS_TONE).sort()).toEqual(Object.values(OIDC_PROVIDER_STATUS).sort());
    Object.values(OIDC_PROVIDER_STATUS_TONE).forEach((tone) => expect(Object.values(STATUS_TONE)).toContain(tone));
  });

  it('shows retired and disabled providers as neutral and failures as errors', () => {
    expect(OIDC_PROVIDER_STATUS_TONE[OIDC_PROVIDER_STATUS.RETIRED]).toBe(STATUS_TONE.NEUTRAL);
    expect(OIDC_PROVIDER_STATUS_TONE[OIDC_PROVIDER_STATUS.DISABLED]).toBe(STATUS_TONE.NEUTRAL);
    expect(OIDC_PROVIDER_STATUS_TONE[OIDC_PROVIDER_STATUS.FAILED]).toBe(STATUS_TONE.ERROR);
  });
});

describe('authentication state tones', () => {
  it('maps every authentication state to a status tone', () => {
    expect(Object.keys(AUTHENTICATION_STATE_TONE).sort()).toEqual(Object.values(AUTHENTICATION_STATE).sort());
    expect(AUTHENTICATION_STATE_TONE[AUTHENTICATION_STATE.OIDC_ACTIVE]).toBe(STATUS_TONE.SUCCESS);
  });
});

describe('provider confirmations', () => {
  it('asks before activating, disabling, retiring or switching Grafana, and not before enabling or retrying', () => {
    expect(Object.keys(PROVIDER_CONFIRM).sort()).toEqual(
      [
        PROVIDER_ACTION.ACTIVATE,
        PROVIDER_ACTION.DISABLE,
        PROVIDER_ACTION.RETIRE,
        PROVIDER_ACTION.SELECT_GENERIC,
      ].sort(),
    );
  });

  it('names the provider in every description', () => {
    Object.values(PROVIDER_CONFIRM).forEach((config) => expect(config?.description('Okta')).toContain('Okta'));
  });
});
