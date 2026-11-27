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

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';

import { QUEUED_POLL_MS } from './constants';
import type { EmailHistoryItem } from './types';
import { useQueuedPoll } from './use-queued-poll';

describe('useQueuedPoll', () => {
  const page = {
    items: [{ id: 1, status: 'QUEUED', updatedAt: '2026-11-24T10:00:00Z' } as EmailHistoryItem],
    count: 1,
  };
  const query = { page: 1, pageSize: 20 };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('skips ticks while the last check is still running', async () => {
    let finish: (value: typeof page) => void = () => undefined;
    const history = vi.spyOn(API.mail, 'history').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderHook(() => useQueuedPoll(page, query, () => undefined));

    await vi.advanceTimersByTimeAsync(QUEUED_POLL_MS * 3);
    expect(history).toHaveBeenCalledTimes(1);

    finish(page);
    await vi.advanceTimersByTimeAsync(QUEUED_POLL_MS);
    expect(history).toHaveBeenCalledTimes(2);
  });
});
