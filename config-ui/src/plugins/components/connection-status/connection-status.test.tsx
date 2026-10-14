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

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConnectionHealthEntry } from '@/features/connections';
import { COPY, HEALTH_FAILURE_REASON } from '@/features/connections/constants';
import { IConnectionStatus, type IConnection } from '@/types';
import { messageMock } from '@/ui/__tests__/mock-message';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import { COPY as HEALTH_VIEW_COPY } from '@/ui/connection-health/constants';

import { ConnectionStatus } from './connection-status';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  selector: undefined as ((state: unknown) => unknown) | undefined,
}));

vi.mock('@/hooks', () => ({
  useAppDispatch: () => mocks.dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => {
    mocks.selector = selector;
    return selector({ connections: { health: {} } });
  },
}));

vi.mock('antd', async (importOriginal) =>
  (await import('@/ui/__tests__/mock-message')).withMockedMessage(await importOriginal<typeof import('antd')>()),
);

const connection = {
  unique: 'github-1',
  plugin: 'github',
  pluginName: 'GitHub',
  id: 1,
  name: 'GitHub connection',
  status: IConnectionStatus.IDLE,
} as IConnection;

const mockRetestResult = (status: IConnectionStatus, health: ConnectionHealthEntry) => {
  mocks.dispatch.mockReturnValue({
    unwrap: () => Promise.resolve({ unique: connection.unique, status, health }),
  });
};

const performRetest = () => {
  renderWithTheme(<ConnectionStatus connection={connection} />);
  fireEvent.click(screen.getByRole('button', { name: HEALTH_VIEW_COPY.retest }));
};

describe('ConnectionStatus retest feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a failure toast when the fulfilled test result is offline', async () => {
    mockRetestResult(IConnectionStatus.OFFLINE, {
      status: IConnectionStatus.OFFLINE,
      reason: HEALTH_FAILURE_REASON.CREDENTIALS,
      message: 'authentication failed',
      testedAt: Date.now(),
    });
    performRetest();

    await waitFor(() => expect(messageMock.error).toHaveBeenCalledWith('authentication failed'));
    expect(messageMock.success).not.toHaveBeenCalled();
  });

  it('uses the generic fallback when an offline result has no message', async () => {
    mockRetestResult(IConnectionStatus.OFFLINE, {
      status: IConnectionStatus.OFFLINE,
      reason: HEALTH_FAILURE_REASON.FAILED,
      testedAt: Date.now(),
    });
    performRetest();

    await waitFor(() => expect(messageMock.error).toHaveBeenCalledWith(COPY.testFailed.fallback));
    expect(messageMock.success).not.toHaveBeenCalled();
  });

  it('reduces a multiline offline reason to its readable summary', async () => {
    mockRetestResult(IConnectionStatus.OFFLINE, {
      status: IConnectionStatus.OFFLINE,
      reason: HEALTH_FAILURE_REASON.FAILED,
      message: 'attached stack trace\nWraps: (2) Repository was not found\nWraps: (3) ignored detail',
      testedAt: Date.now(),
    });
    performRetest();

    await waitFor(() => expect(messageMock.error).toHaveBeenCalledWith('Repository was not found'));
    expect(messageMock.success).not.toHaveBeenCalled();
  });

  it('shows a success toast when the fulfilled test result is online', async () => {
    mockRetestResult(IConnectionStatus.ONLINE, {
      status: IConnectionStatus.ONLINE,
      testedAt: Date.now(),
    });
    performRetest();

    await waitFor(() => expect(messageMock.success).toHaveBeenCalledWith('Operation successfully completed'));
    expect(messageMock.error).not.toHaveBeenCalled();
  });

  it('selects only this connection health entry', () => {
    renderWithTheme(<ConnectionStatus connection={connection} />);
    const entry = { status: IConnectionStatus.ONLINE, testedAt: Date.now() };
    const { selector } = mocks;
    if (!selector) throw new Error('Health selector was not captured.');

    expect(selector({ connections: { health: { [connection.unique]: entry, other: { testedAt: 1 } } } })).toBe(entry);
    expect(selector({ connections: { health: { [connection.unique]: entry, other: { testedAt: 2 } } } })).toBe(entry);
  });
});
