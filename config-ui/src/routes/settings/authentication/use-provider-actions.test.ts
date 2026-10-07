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

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import type { OIDCProvider } from '@/api/access';

import { COPY, PROVIDER_ACTION } from './constants';
import { useProviderActions } from './use-provider-actions';

vi.mock('antd', async (importOriginal) => ({
  ...(await importOriginal<typeof import('antd')>()),
  message: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/api', () => ({
  default: {
    access: {
      activateOIDCProvider: vi.fn(),
      enableOIDCProvider: vi.fn(),
      disableOIDCProvider: vi.fn(),
    },
  },
}));

const access = vi.mocked(API.access);
const PROVIDER = { providerKey: 'okta', displayName: 'Okta' } as OIDCProvider;

const setup = () => {
  const onDone = vi.fn();
  return { ...renderHook(() => useProviderActions({ onDone })), onDone };
};

describe('useProviderActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enables at once, without a confirmation', async () => {
    const { result, onDone } = setup();
    access.enableOIDCProvider.mockResolvedValue(PROVIDER);
    await act(async () => result.current.start(PROVIDER_ACTION.ENABLE, PROVIDER));
    expect(access.enableOIDCProvider).toHaveBeenCalledWith('okta');
    expect(result.current.confirmProps.open).toBe(false);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('asks before disabling, naming the provider, and sends nothing until confirmed', async () => {
    const { result, onDone } = setup();
    access.disableOIDCProvider.mockResolvedValue(PROVIDER);
    act(() => result.current.start(PROVIDER_ACTION.DISABLE, PROVIDER));
    expect(result.current.confirmProps).toMatchObject({
      open: true,
      description: COPY.confirm.disable.description('Okta'),
    });
    expect(access.disableOIDCProvider).not.toHaveBeenCalled();
    await act(async () => result.current.confirmProps.onConfirm());
    expect(access.disableOIDCProvider).toHaveBeenCalledWith('okta');
    expect(result.current.confirmProps.open).toBe(false);
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('closes the confirmation, keeps a page error and refreshes when the request fails', async () => {
    const { result, onDone } = setup();
    access.activateOIDCProvider.mockRejectedValue(new Error('boom'));
    act(() => result.current.start(PROVIDER_ACTION.ACTIVATE, PROVIDER));
    await act(async () => result.current.confirmProps.onConfirm());
    expect(result.current.confirmProps.open).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(onDone).toHaveBeenCalledOnce();
    act(() => result.current.clearError());
    expect(result.current.error).toBeUndefined();
  });
});
