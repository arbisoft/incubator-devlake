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

import { COPY } from '@/features/connections/constants';
import { IConnectionStatus, type IConnection } from '@/types';
import { messageMock } from '@/ui/__tests__/mock-message';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { ConnectionStatus } from './connection-status';

const mocks = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock('@/hooks', () => ({
  useAppDispatch: () => mocks.dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({ connections: { health: {} } }),
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

describe('ConnectionStatus retest feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a failure toast when the fulfilled test result is offline', async () => {
    mocks.dispatch.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          unique: connection.unique,
          status: IConnectionStatus.OFFLINE,
          health: {
            status: IConnectionStatus.OFFLINE,
            reason: 'credentials',
            message: 'authentication failed',
            testedAt: Date.now(),
          },
        }),
    });
    renderWithTheme(<ConnectionStatus connection={connection} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retest connection' }));

    await waitFor(() => expect(messageMock.error).toHaveBeenCalledWith(COPY.testFailed.credentials));
    expect(messageMock.success).not.toHaveBeenCalled();
  });

  it('shows a success toast when the fulfilled test result is online', async () => {
    mocks.dispatch.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          unique: connection.unique,
          status: IConnectionStatus.ONLINE,
          health: { status: IConnectionStatus.ONLINE, testedAt: Date.now() },
        }),
    });
    renderWithTheme(<ConnectionStatus connection={connection} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retest connection' }));

    await waitFor(() => expect(messageMock.success).toHaveBeenCalledWith('Operation successfully completed'));
    expect(messageMock.error).not.toHaveBeenCalled();
  });
});
