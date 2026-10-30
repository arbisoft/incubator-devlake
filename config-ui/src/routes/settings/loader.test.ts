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

import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { ACCESS_ROLE, type AccessCurrent } from '@/api/access';
import { PATHS } from '@/config';

import { accessLoader, adminFeaturesLoader } from './loader';

vi.mock('@/api', () => ({ default: { access: { current: vi.fn() } } }));

const current = vi.mocked(API.access.current);

const ADMIN: AccessCurrent = { enabled: true, role: ACCESS_ROLE.CUSTOMER_ADMIN };
const MEMBER: AccessCurrent = { enabled: true, role: ACCESS_ROLE.MEMBER };

const redirectLocation = (result: unknown) => (result instanceof Response ? result.headers.get('Location') : undefined);

describe('adminFeaturesLoader', () => {
  beforeEach(() => {
    current.mockReset();
  });

  it('redirects an enabled member to the root', async () => {
    current.mockResolvedValue(MEMBER);
    expect(redirectLocation(await adminFeaturesLoader())).toBe(PATHS.ROOT());
  });

  it.each([
    ['an administrator', ADMIN],
    ['disabled access', { enabled: false }],
  ])('lets %s through', async (_name, access) => {
    current.mockResolvedValue(access);
    expect(await adminFeaturesLoader()).toBeNull();
  });

  it('redirects when the access lookup fails', async () => {
    current.mockRejectedValue(new Error('offline'));
    expect(redirectLocation(await adminFeaturesLoader())).toBe(PATHS.ROOT());
  });
});

describe('accessLoader', () => {
  beforeEach(() => {
    current.mockReset();
  });

  it('still redirects disabled access and a member, and admits an administrator', async () => {
    current.mockResolvedValue({ enabled: false });
    expect(redirectLocation(await accessLoader())).toBe(PATHS.ROOT());
    current.mockResolvedValue(MEMBER);
    expect(redirectLocation(await accessLoader())).toBe(PATHS.ROOT());
    current.mockResolvedValue(ADMIN);
    expect(await accessLoader()).toBeNull();
  });
});
