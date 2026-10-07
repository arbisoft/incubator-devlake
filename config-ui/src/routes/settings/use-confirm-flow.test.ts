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
import { describe, expect, it, vi } from 'vitest';

import { CONFIRM_TONE } from '@/ui';

import { useConfirmFlow } from './use-confirm-flow';

const CONFIG = {
  tone: CONFIRM_TONE.DANGER,
  title: () => 'Remove?',
  description: (name: string) => `Remove ${name}.`,
  confirm: 'Remove',
};

const setup = (run: () => Promise<boolean>) =>
  renderHook(() =>
    useConfirmFlow<{ confirm: boolean }>({
      resolve: ({ confirm }) => ({ config: confirm ? CONFIG : undefined, name: 'Ada' }),
      run,
    }),
  );

describe('useConfirmFlow', () => {
  it('runs at once when nothing needs confirming', async () => {
    const run = vi.fn().mockResolvedValue(true);
    const { result } = setup(run);
    await act(async () => result.current.request({ confirm: false }));
    expect(run).toHaveBeenCalledOnce();
    expect(result.current.confirmProps.open).toBe(false);
  });

  it('opens a confirmation naming the target and runs only on confirm', async () => {
    const run = vi.fn().mockResolvedValue(true);
    const { result } = setup(run);
    act(() => result.current.request({ confirm: true }));
    expect(result.current.confirmProps).toMatchObject({
      open: true,
      tone: CONFIRM_TONE.DANGER,
      description: 'Remove Ada.',
    });
    expect(run).not.toHaveBeenCalled();
    await act(async () => result.current.confirmProps.onConfirm());
    expect(run).toHaveBeenCalledOnce();
    expect(result.current.confirmProps.open).toBe(false);
  });

  it('stays open when the run reports it is not done', async () => {
    const { result } = setup(vi.fn().mockResolvedValue(false));
    act(() => result.current.request({ confirm: true }));
    await act(async () => result.current.confirmProps.onConfirm());
    expect(result.current.confirmProps.open).toBe(true);
  });
});
