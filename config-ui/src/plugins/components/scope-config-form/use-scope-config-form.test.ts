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
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { messageMock } from '@/ui/__tests__/mock-message';

import { COPY, SAVE_ERROR_MAP, SCOPE_CONFIG_STEP } from './constants';
import { useScopeConfigForm } from './use-scope-config-form';

vi.mock('antd', async (importOriginal) =>
  (await import('@/ui/__tests__/mock-message')).withMockedMessage(await importOriginal<typeof import('antd')>()),
);

vi.mock('@/api', () => ({
  default: { scopeConfig: { get: vi.fn(), create: vi.fn(), update: vi.fn() } },
}));

vi.mock('@/plugins/utils', () => ({
  getPluginConfig: () => ({
    plugin: 'github',
    scopeConfig: { entities: ['CODE', 'TICKET'], transformation: { issueTypeBug: '(bug)' } },
  }),
}));

const scopeConfig = vi.mocked(API.scopeConfig);

const DEFAULT_NAME = 'shared-config-<0>';

const setup = (options: Partial<Parameters<typeof useScopeConfigForm>[0]> = {}) => {
  const onSubmit = vi.fn();
  const hook = renderHook(() =>
    useScopeConfigForm({ plugin: 'github', connectionId: 1, defaultName: DEFAULT_NAME, onSubmit, ...options }),
  );
  return { ...hook, onSubmit };
};

describe('useScopeConfigForm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts on the details step with the plugin defaults', () => {
    const { result } = setup();
    expect(result.current.step).toBe(SCOPE_CONFIG_STEP.DETAILS);
    expect(result.current.name).toBe(DEFAULT_NAME);
    expect(result.current.entities).toEqual(['CODE', 'TICKET']);
    expect(result.current.transformation).toEqual({ issueTypeBug: '(bug)' });
  });

  it('moves between the two steps', () => {
    const { result } = setup();
    act(() => result.current.toTransformations());
    expect(result.current.step).toBe(SCOPE_CONFIG_STEP.TRANSFORMATIONS);
    act(() => result.current.toDetails());
    expect(result.current.step).toBe(SCOPE_CONFIG_STEP.DETAILS);
  });

  it('creates a scope config with the name, entities and transformation', async () => {
    scopeConfig.create.mockResolvedValue({ id: 9 });
    const { result, onSubmit } = setup();
    await act(async () => result.current.submit());
    expect(scopeConfig.create).toHaveBeenCalledWith('github', 1, {
      name: DEFAULT_NAME,
      entities: ['CODE', 'TICKET'],
      issueTypeBug: '(bug)',
    });
    expect(onSubmit).toHaveBeenCalledWith(9);
  });

  it('loads an existing config and updates it', async () => {
    scopeConfig.get.mockResolvedValue({
      id: 5,
      connectionId: 1,
      name: 'existing',
      entities: ['CICD'],
      createdAt: 'x',
      updatedAt: 'y',
      prType: 'type(.*)',
    });
    scopeConfig.update.mockResolvedValue({ id: 5 });
    const { result, onSubmit } = setup({ scopeConfigId: 5 });
    await waitFor(() => expect(result.current.name).toBe('existing'));
    expect(result.current.transformation).toEqual({ prType: 'type(.*)' });

    await act(async () => result.current.submit());
    expect(scopeConfig.update).toHaveBeenCalledWith('github', 1, 5, {
      name: 'existing',
      entities: ['CICD'],
      prType: 'type(.*)',
    });
    expect(onSubmit).toHaveBeenCalledWith(5);
  });

  it('creates a copy instead of updating when asked to duplicate', async () => {
    scopeConfig.get.mockResolvedValue({ id: 5, name: 'existing', entities: ['CODE'] });
    scopeConfig.create.mockResolvedValue({ id: 6 });
    const { result } = setup({ scopeConfigId: 5, forceCreate: true });
    await waitFor(() => expect(result.current.name).toBe('existing-copy'));
    await act(async () => result.current.submit());
    expect(scopeConfig.update).not.toHaveBeenCalled();
    expect(scopeConfig.create).toHaveBeenCalledOnce();
  });

  it('explains a failed save with the mapped message and does not report success', async () => {
    scopeConfig.create.mockRejectedValue({ response: { status: 409, data: { message: 'raw' } } });
    const { result, onSubmit } = setup();
    await act(async () => result.current.submit());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(messageMock.error).toHaveBeenCalledWith(SAVE_ERROR_MAP['409']);
  });

  it('falls back to the generic message for an unmapped failure', async () => {
    scopeConfig.create.mockRejectedValue(new Error('boom'));
    const { result } = setup();
    await act(async () => result.current.submit());
    expect(messageMock.error).toHaveBeenCalledWith(COPY.saveFailed);
  });
});
