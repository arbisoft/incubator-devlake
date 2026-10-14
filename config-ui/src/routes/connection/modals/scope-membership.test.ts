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

import { SCOPE_MEMBERSHIP_PAGE_SIZE } from '../constants';

import { loadScopeMembership } from './scope-membership';

vi.mock('@/api', () => ({ default: { scope: { list: vi.fn() } } }));

type GitHubScope = { name: string; fullName: string; githubId: ID };

const githubScope = (githubId: ID): GitHubScope => ({ name: 'repo', fullName: 'org/repo', githubId });
const page = (start: number, count: number) =>
  Array.from({ length: count }, (_, index) => ({ scope: githubScope(start + index) }));

const list = vi.mocked(API.scope.list);

describe('loadScopeMembership', () => {
  beforeEach(() => vi.resetAllMocks());

  it('loads every page and deduplicates normalized IDs', async () => {
    const controller = new AbortController();
    list
      .mockResolvedValueOnce({ count: SCOPE_MEMBERSHIP_PAGE_SIZE + 2, scopes: page(1, SCOPE_MEMBERSHIP_PAGE_SIZE) })
      .mockResolvedValueOnce({
        count: SCOPE_MEMBERSHIP_PAGE_SIZE + 2,
        scopes: [{ scope: githubScope(SCOPE_MEMBERSHIP_PAGE_SIZE + 1) }, { scope: githubScope(1) }],
      });

    const membership = await loadScopeMembership('github', 9, controller.signal);

    expect(list).toHaveBeenNthCalledWith(
      1,
      'github',
      9,
      { page: 1, pageSize: SCOPE_MEMBERSHIP_PAGE_SIZE },
      controller.signal,
    );
    expect(list).toHaveBeenNthCalledWith(
      2,
      'github',
      9,
      { page: 2, pageSize: SCOPE_MEMBERSHIP_PAGE_SIZE },
      controller.signal,
    );
    expect(membership).toHaveLength(SCOPE_MEMBERSHIP_PAGE_SIZE + 1);
    expect(membership.at(-1)).toEqual({ id: String(SCOPE_MEMBERSHIP_PAGE_SIZE + 1) });
  });

  it('returns an empty membership for a zero-count connection', async () => {
    list.mockResolvedValue({ count: 0, scopes: [] });

    await expect(loadScopeMembership('github', 9, new AbortController().signal)).resolves.toEqual([]);
    expect(list).toHaveBeenCalledOnce();
  });

  it('rejects a partial result when a later page fails', async () => {
    list
      .mockResolvedValueOnce({ count: SCOPE_MEMBERSHIP_PAGE_SIZE + 1, scopes: page(1, SCOPE_MEMBERSHIP_PAGE_SIZE) })
      .mockRejectedValueOnce(new Error('fixed safe failure'));

    await expect(loadScopeMembership('github', 9, new AbortController().signal)).rejects.toBeInstanceOf(Error);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('rejects when a page makes no progress before the reported count', async () => {
    list
      .mockResolvedValueOnce({ count: SCOPE_MEMBERSHIP_PAGE_SIZE + 1, scopes: page(1, SCOPE_MEMBERSHIP_PAGE_SIZE) })
      .mockResolvedValueOnce({ count: SCOPE_MEMBERSHIP_PAGE_SIZE + 1, scopes: [] });

    await expect(loadScopeMembership('github', 9, new AbortController().signal)).rejects.toBeInstanceOf(Error);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('rejects an already-aborted request without returning incomplete membership', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(loadScopeMembership('github', 9, controller.signal)).rejects.toBeInstanceOf(Error);
    expect(list).not.toHaveBeenCalled();
  });
});
