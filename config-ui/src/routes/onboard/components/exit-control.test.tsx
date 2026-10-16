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

import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDeferred } from '../__tests__/onboard.test-utils';
import { COPY } from '../constants';

import { ExitControl } from './exit-control';

const mocks = vi.hoisted(() => ({
  open: false,
  loading: false,
  onConfirm: undefined as (() => Promise<void>) | undefined,
}));

vi.mock('@/ui', () => ({
  CONFIRM_TONE: { DEFAULT: 'default' },
  IconButton: ({ label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) => (
    <button onClick={onClick}>{label}</button>
  ),
  ConfirmModal: ({
    open,
    loading,
    confirmLabel,
    onConfirm,
  }: {
    open: boolean;
    loading?: boolean;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  }) => {
    mocks.open = open;
    mocks.loading = Boolean(loading);
    mocks.onConfirm = onConfirm;
    return open ? (
      <div role="dialog">
        <span>{loading ? 'Loading' : 'Ready'}</span>
        <button onClick={onConfirm}>{confirmLabel}</button>
      </div>
    ) : null;
  },
}));

const setup = (onExit: () => Promise<boolean>) => {
  render(<ExitControl onExit={onExit} />);
  fireEvent.click(screen.getByRole('button', { name: COPY.exit }));
};

const startExitConfirmation = (onExit: () => Promise<boolean>) => {
  setup(onExit);
  const { onConfirm } = mocks;
  if (typeof onConfirm !== 'function') {
    throw new Error('Exit confirmation is unavailable.');
  }

  let pending: Promise<void> | undefined;
  act(() => {
    pending = onConfirm();
  });

  if (!pending) {
    throw new Error('Exit confirmation did not start.');
  }

  return pending;
};

const finishExitConfirmation = async (
  result: ReturnType<typeof createDeferred<boolean>>,
  pending: Promise<void>,
  value: boolean,
) => {
  await act(async () => {
    result.resolve(value);
    await pending;
  });
};

describe('ExitControl confirmation', () => {
  beforeEach(() => {
    mocks.open = false;
    mocks.loading = false;
    mocks.onConfirm = undefined;
  });

  it('keeps the confirmation open when exit returns false and clears loading', async () => {
    const result = createDeferred<boolean>();
    const pending = startExitConfirmation(() => result.promise);
    expect(mocks.loading).toBe(true);

    await finishExitConfirmation(result, pending, false);

    expect(mocks.open).toBe(true);
    expect(mocks.loading).toBe(false);
  });

  it('closes the confirmation after a successful exit and clears loading', async () => {
    const result = createDeferred<boolean>();
    const pending = startExitConfirmation(() => result.promise);
    await finishExitConfirmation(result, pending, true);

    expect(mocks.open).toBe(false);
    expect(mocks.loading).toBe(false);
  });

  it('propagates exit rejection and clears loading while keeping the dialog open', async () => {
    const result = createDeferred<boolean>();
    const pending = startExitConfirmation(() => result.promise);
    expect(mocks.loading).toBe(true);

    await act(async () => {
      result.reject(new Error('safe exit failure'));
      await expect(pending).rejects.toThrow('safe exit failure');
    });

    expect(mocks.open).toBe(true);
    expect(mocks.loading).toBe(false);
  });
});
