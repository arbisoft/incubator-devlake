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
import { message } from 'antd';
import { HttpStatusCode } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { OTEL_STATUS, type OtelConnectionResponse } from '@/api/otel';
import { CONFIRM_TONE } from '@/ui/confirm-modal/constants';

import { COPY, LIFECYCLE_ACTION, OTEL_ATTENTION_CHANGED_EVENT } from './constants';
import { useOtelAction } from './use-otel-action';

vi.mock('@/api', () => ({
  default: {
    otel: { rotate: vi.fn(), revoke: vi.fn(), hide: vi.fn(), finalizeRotation: vi.fn(), apply: vi.fn() },
  },
}));

const otel = vi.mocked(API.otel);

const response = (overrides: Partial<OtelConnectionResponse> = {}): OtelConnectionResponse => ({
  connection: {
    id: 7,
    name: 'platform',
    teamName: 'Platform',
    teamSlug: 'platform',
    collectorEndpoint: 'https://collector',
    protocol: 'http',
    status: OTEL_STATUS.ACTIVE,
    organizationId: null,
    revokedAt: null,
    createdAt: '',
    updatedAt: '',
  },
  credentials: [],
  restartRequired: false,
  recoveryRequired: false,
  storageNeedsApplying: false,
  projects: [],
  ...overrides,
});

const failure = (status: number, data: unknown) => ({ response: { status, data } });

const setup = () => {
  const onDone = vi.fn();
  const onCredential = vi.fn();
  const attention = vi.fn();
  window.addEventListener(OTEL_ATTENTION_CHANGED_EVENT, attention);
  const hook = renderHook(() => useOtelAction({ onDone, onCredential }));
  return {
    ...hook,
    onDone,
    onCredential,
    attention,
    stop: () => window.removeEventListener(OTEL_ATTENTION_CHANGED_EVENT, attention),
  };
};

describe('useOtelAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    vi.spyOn(message, 'warning').mockImplementation(() => undefined as never);
    vi.spyOn(message, 'info').mockImplementation(() => undefined as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it('opens a confirm that names the team and nothing runs until it is confirmed', () => {
    const { result, stop } = setup();
    act(() => result.current.start(LIFECYCLE_ACTION.REVOKE, response()));
    expect(result.current.confirmProps.open).toBe(true);
    expect(result.current.confirmProps.tone).toBe(CONFIRM_TONE.DANGER);
    expect(result.current.confirmProps.title).toBe(COPY.confirm.revoke.title('Platform'));
    expect(result.current.confirmProps.description).toContain('Platform');
    expect(otel.revoke).not.toHaveBeenCalled();
    stop();
  });

  it('runs the confirmed action, refreshes and tells the shell banner', async () => {
    otel.finalizeRotation.mockResolvedValue(response());
    const { result, onDone, onCredential, attention, stop } = setup();
    act(() => result.current.start(LIFECYCLE_ACTION.FINALIZE, response()));
    await act(() => result.current.confirmProps.onConfirm());
    expect(otel.finalizeRotation).toHaveBeenCalledWith(7);
    expect(onDone).toHaveBeenCalledOnce();
    expect(attention).toHaveBeenCalledOnce();
    expect(onCredential).not.toHaveBeenCalled();
    expect(message.success).toHaveBeenCalledWith(COPY.done.finalize('Platform'));
    expect(result.current.confirmProps.open).toBe(false);
    stop();
  });

  it('hands a rotated credential to the one-time display', async () => {
    const rotated = response({ managedSettings: { env: { CLAUDE_CODE_ENABLE_TELEMETRY: '1' } } });
    otel.rotate.mockResolvedValue(rotated);
    const { result, onCredential, stop } = setup();
    act(() => result.current.start(LIFECYCLE_ACTION.ROTATE, response()));
    await act(() => result.current.confirmProps.onConfirm());
    expect(onCredential).toHaveBeenCalledWith(rotated);
    stop();
  });

  it('keeps the confirm open and explains it when the endpoint could not apply', async () => {
    otel.apply.mockResolvedValue(response({ restartRequired: true, restartHint: 'Collector is cooling down.' }));
    const { result, onCredential, stop } = setup();
    act(() => result.current.start(LIFECYCLE_ACTION.APPLY, response()));
    await act(() => result.current.confirmProps.onConfirm());
    expect(message.error).toHaveBeenCalledWith(COPY.errors.applyCooldown);
    expect(message.success).not.toHaveBeenCalled();
    expect(onCredential).not.toHaveBeenCalled();
    expect(result.current.confirmProps.open).toBe(true);
    stop();
  });

  it('falls back to the apply copy when the endpoint gives no hint', async () => {
    otel.apply.mockResolvedValue(response({ restartRequired: true }));
    const { result, stop } = setup();
    act(() => result.current.start(LIFECYCLE_ACTION.APPLY, response()));
    await act(() => result.current.confirmProps.onConfirm());
    expect(message.error).toHaveBeenCalledWith(COPY.errors.apply);
    stop();
  });

  it('shows safe copy and stays open when the request fails', async () => {
    otel.hide.mockRejectedValue(failure(HttpStatusCode.ServiceUnavailable, { message: 'htpasswd: permission denied' }));
    const { result, onDone, stop } = setup();
    act(() => result.current.start(LIFECYCLE_ACTION.HIDE, response()));
    await act(() => result.current.confirmProps.onConfirm());
    expect(message.error).toHaveBeenCalledWith(COPY.errors.credentialStorage);
    expect(onDone).not.toHaveBeenCalled();
    expect(result.current.confirmProps.open).toBe(true);
    stop();
  });
});
