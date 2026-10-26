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

import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';

import { BLUEPRINT_ID, makeDetailBlueprint } from './__tests__/blueprint-fixtures';
import { useBlueprintDetail } from './hooks';

vi.mock('antd', async (importOriginal) =>
  (await import('@/ui/__tests__/mock-message')).loadMockedMessage(importOriginal),
);

vi.mock('@/api', () => ({ default: { blueprint: { get: vi.fn(), pipelines: vi.fn() } } }));

const blueprintApi = vi.mocked(API.blueprint);
const BLUEPRINT = makeDetailBlueprint();

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe('useBlueprintDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    blueprintApi.get.mockResolvedValue(BLUEPRINT);
    blueprintApi.pipelines.mockResolvedValue({ pipelines: [], count: 0 });
  });

  it('exposes a blueprint request failure and retries the same id', async () => {
    blueprintApi.get.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useBlueprintDetail(BLUEPRINT_ID), { wrapper });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.detail?.blueprint.id).toBe(BLUEPRINT_ID));
    expect(blueprintApi.get).toHaveBeenCalledTimes(2);
  });

  it('exposes a pipeline list request failure from the detail load', async () => {
    blueprintApi.pipelines.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useBlueprintDetail(BLUEPRINT_ID), { wrapper });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.detail).toBeUndefined();
  });
});
