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

import { ACCESS_ROLE, ACCESS_STATUS } from '@/api/access';
import { STATUS_TONE } from '@/ui';

import {
  ACCESS_STATUS_TONE,
  COPY,
  LIFECYCLE_ACTION,
  LIFECYCLE_CONFIRM,
  LIFECYCLE_SUBJECT,
  ROLE_LABEL,
  ROLE_OPTIONS,
} from './constants';

describe('access status tones', () => {
  it('maps every access status to a status tone', () => {
    expect(Object.keys(ACCESS_STATUS_TONE).sort()).toEqual(Object.values(ACCESS_STATUS).sort());
    Object.values(ACCESS_STATUS_TONE).forEach((tone) => expect(Object.values(STATUS_TONE)).toContain(tone));
  });

  it('shows an active access entry as success and a disabled one as neutral', () => {
    expect(ACCESS_STATUS_TONE[ACCESS_STATUS.ACTIVE]).toBe(STATUS_TONE.SUCCESS);
    expect(ACCESS_STATUS_TONE[ACCESS_STATUS.DISABLED]).toBe(STATUS_TONE.NEUTRAL);
  });

  it('labels each status for users and for domains', () => {
    Object.values(ACCESS_STATUS).forEach((status) => {
      expect(COPY.users.status[status]).toBeTruthy();
      expect(COPY.domains.status[status]).toBeTruthy();
    });
  });
});

describe('access roles', () => {
  it('offers every role once, with its label', () => {
    expect(ROLE_OPTIONS.map((option) => option.value).sort()).toEqual(Object.values(ACCESS_ROLE).sort());
    ROLE_OPTIONS.forEach((option) => expect(option.label).toBe(ROLE_LABEL[option.value]));
  });
});

describe('lifecycle confirmations', () => {
  it('confirms hiding a user or a domain as a danger action', () => {
    expect(LIFECYCLE_CONFIRM[LIFECYCLE_SUBJECT.USER][LIFECYCLE_ACTION.HIDE]?.tone).toBe('danger');
    expect(LIFECYCLE_CONFIRM[LIFECYCLE_SUBJECT.DOMAIN][LIFECYCLE_ACTION.HIDE]?.tone).toBe('danger');
  });

  it('does not ask before enabling or disabling', () => {
    Object.values(LIFECYCLE_SUBJECT).forEach((subject) => {
      expect(LIFECYCLE_CONFIRM[subject][LIFECYCLE_ACTION.ENABLE]).toBeUndefined();
      expect(LIFECYCLE_CONFIRM[subject][LIFECYCLE_ACTION.DISABLE]).toBeUndefined();
    });
  });

  it('names the thing it acts on in every description', () => {
    Object.values(LIFECYCLE_CONFIRM).forEach((actions) =>
      Object.values(actions).forEach((config) => expect(config.description('Ada')).toContain('Ada')),
    );
  });
});
