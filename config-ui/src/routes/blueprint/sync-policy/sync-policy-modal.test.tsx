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

const ARIA_DISABLED = { TRUE: 'true', FALSE: 'false' } as const;
const ARIA_DISABLED_ATTRIBUTE = 'aria-disabled';
const VALUES: SyncPolicyValues = {
  isManual: false,
  cronConfig: cronPresets[0].config,
  skipOnFail: false,
  timeAfter: null,
};

const setup = (mode = IBPMode.NORMAL, values = VALUES) => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  renderWithTheme(
    <SyncPolicyModal open mode={mode} values={values} loading={false} onSubmit={onSubmit} onCancel={onCancel} />,
  );
  return { onSubmit, onCancel };
};

const setupWithInvalidCron = () => {
  const { onSubmit } = setup(IBPMode.NORMAL, { ...VALUES, cronConfig: 'x * * * *' });
  const submit = screen.getByRole('button', { name: COPY.modal.submit });
  return { onSubmit, submit };
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

  it('blocks submitting an invalid custom cron code', () => {
    const invalid = { ...VALUES, cronConfig: 'x * * * *' };
    const { onSubmit } = setup(IBPMode.NORMAL, invalid);
    const submit = screen.getByRole('button', { name: COPY.modal.submit });

    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(submit.getAttribute(ARIA_DISABLED_ATTRIBUTE)).toBe(ARIA_DISABLED.TRUE);
  });

  it('allows a corrected custom cron code to submit', () => {
    const { onSubmit, submit } = setupWithInvalidCron();
    fireEvent.change(screen.getByRole('textbox', { name: CUSTOM_CRON_FIELDS[0] }), { target: { value: '15' } });

    expect(submit.getAttribute(ARIA_DISABLED_ATTRIBUTE)).toBe(ARIA_DISABLED.FALSE);
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ ...VALUES, cronConfig: '15 * * * *' });
  });

  it('allows manual frequency while retaining an invalid dormant cron code', () => {
    const { onSubmit, submit } = setupWithInvalidCron();
    fireEvent.click(screen.getByRole('radio', { name: FREQUENCY.MANUAL }));

    expect(submit.getAttribute(ARIA_DISABLED_ATTRIBUTE)).toBe(ARIA_DISABLED.FALSE);
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ ...VALUES, isManual: true, cronConfig: 'x * * * *' });
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
