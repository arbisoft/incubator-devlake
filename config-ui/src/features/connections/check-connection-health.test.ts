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

import { afterEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { IConnectionStatus, type IConnection } from '@/types';

import { HEALTH_FAILURE_REASON, HEALTH_PROBE_TIMEOUT_MS } from './constants';
import { checkConnectionHealth } from './slice';

vi.mock('@/api', () => ({ default: { connection: { test: vi.fn() } } }));

const testMock = vi.mocked(API.connection.test);
const connection = { unique: 'github-1', plugin: 'github', id: 1 } as IConnection;
const run = () => checkConnectionHealth(connection)(vi.fn(), vi.fn(), undefined);

describe('checkConnectionHealth', () => {
  afterEach(() => vi.clearAllMocks());

  it('bounds the background probe with a timeout', async () => {
    testMock.mockResolvedValue({ success: true, message: '' });
    await run();
    expect(testMock).toHaveBeenCalledWith('github', 1, undefined, HEALTH_PROBE_TIMEOUT_MS);
  });

  it('records a probe that timed out as unreachable', async () => {
    testMock.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout of 20000ms exceeded' });
    const { payload } = await run();
    expect(payload).toMatchObject({
      unique: 'github-1',
      health: { status: IConnectionStatus.OFFLINE, reason: HEALTH_FAILURE_REASON.UNREACHABLE },
    });
  });
});
