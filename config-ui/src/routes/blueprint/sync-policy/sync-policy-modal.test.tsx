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

import { cronPresets } from '@/config/cron';
import { IBPMode } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import { COMMON_COPY } from '@/ui/constants';

import { COPY, CUSTOM_CRON_FIELDS, FREQUENCY } from './constants';
import { SyncPolicyModal } from './sync-policy-modal';
import type { SyncPolicyValues } from './types';

const VALUES: SyncPolicyValues = {
  isManual: false,
  cronConfig: cronPresets[0].config,
  skipOnFail: false,
  timeAfter: null,
};

const setup = (mode = IBPMode.NORMAL) => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  renderWithTheme(
    <SyncPolicyModal open mode={mode} values={VALUES} loading={false} onSubmit={onSubmit} onCancel={onCancel} />,
  );
  return { onSubmit, onCancel };
};

describe('SyncPolicyModal', () => {
  it('is a dialog named by its title', () => {
    setup();
    expect(screen.getByRole('dialog', { name: COPY.modal.title })).toBeTruthy();
  });

  it('saves the current values unchanged', () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole('button', { name: COPY.modal.submit }));
    expect(onSubmit).toHaveBeenCalledWith(VALUES);
  });

  it('shows the cron fields for a custom schedule and saves the edited one', () => {
    const { onSubmit } = setup();
    expect(screen.queryByRole('textbox', { name: CUSTOM_CRON_FIELDS[0] })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: FREQUENCY.CUSTOM }));
    fireEvent.change(screen.getByRole('textbox', { name: CUSTOM_CRON_FIELDS[0] }), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.modal.submit }));
    expect(onSubmit).toHaveBeenCalledWith({ ...VALUES, cronConfig: '15 * * * *' });
  });

  it('warns about a cron code that never runs', () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: FREQUENCY.CUSTOM }));
    fireEvent.change(screen.getByRole('textbox', { name: CUSTOM_CRON_FIELDS[0] }), { target: { value: 'x' } });
    expect(screen.getByRole('alert').textContent).toBe(COPY.frequency.invalid);
  });

  it('saves manual runs and skip on fail', () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole('radio', { name: FREQUENCY.MANUAL }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: COPY.modal.submit }));
    expect(onSubmit).toHaveBeenCalledWith({ ...VALUES, isManual: true, skipOnFail: true });
  });

  it('leaves the time range out in advanced mode', () => {
    setup(IBPMode.ADVANCED);
    expect(screen.queryByText(COPY.timeRange.label)).toBeNull();
  });

  it('cancels', () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: COMMON_COPY.cancel }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
