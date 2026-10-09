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

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import { formatRelativeTime } from '@/ui/utils';

import { ConnectionHealth } from './connection-health';
import { CONNECTION_HEALTH_STATE, COPY } from './constants';
import type { ConnectionHealthProps } from './types';

const MESSAGE = 'The server did not answer';
const FIVE_MINUTES_MS = 5 * 60_000;

const setup = (props: Partial<ConnectionHealthProps> = {}) => {
  const onRetest = vi.fn();
  renderWithTheme(
    <ConnectionHealth state={CONNECTION_HEALTH_STATE.ONLINE} testing={false} onRetest={onRetest} {...props} />,
  );
  return { onRetest };
};

describe('ConnectionHealth', () => {
  it.each([
    [CONNECTION_HEALTH_STATE.ONLINE, COPY.online],
    [CONNECTION_HEALTH_STATE.OFFLINE, COPY.offline],
    [CONNECTION_HEALTH_STATE.UNKNOWN, COPY.unknown],
  ] as const)('labels the %s state with text', (state, label) => {
    setup({ state });
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('keeps retest visible and calls it', () => {
    const { onRetest } = setup();
    fireEvent.click(screen.getByRole('button', { name: COPY.retest }));
    expect(onRetest).toHaveBeenCalledOnce();
  });

  it('shows the time of the last test', () => {
    const testedAt = Date.now() - FIVE_MINUTES_MS;
    setup({ testedAt });
    expect(screen.getByText(COPY.testedAt(formatRelativeTime(testedAt)))).toBeTruthy();
  });

  it('reveals the message in a tooltip', async () => {
    setup({ state: CONNECTION_HEALTH_STATE.OFFLINE, message: MESSAGE });
    fireEvent.mouseEnter(screen.getByText(COPY.offline));
    expect((await screen.findByRole('tooltip')).textContent).toBe(MESSAGE);
  });

  it('shows testing, disables retest and drops the stale time while testing', () => {
    setup({ testing: true, testedAt: Date.now() - FIVE_MINUTES_MS });
    expect(screen.getByText(COPY.testing)).toBeTruthy();
    expect(screen.queryByText(COPY.online)).toBeNull();
    expect(screen.queryByText(/^Tested /)).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: COPY.retest }).disabled).toBe(true);
  });
});
