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

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';

import {
  makeOnboardContext,
  renderOnboard,
  waitForOnboardActionPending,
  waitForOnboardActionSettled,
} from './__tests__/onboard.test-utils';
import { COPY, ONBOARD_PLUGIN, WIZARD_STEP } from './constants';
import { Step1 } from './step-1';

vi.mock('antd', async (importOriginal) =>
  (await import('./__tests__/onboard-antd-mock')).mockOnboardAntd(importOriginal),
);

vi.mock('@/api', () => ({
  default: { project: { checkName: vi.fn() }, store: { set: vi.fn() } },
}));

vi.mock('@/plugins', () => ({
  ConnectionSelect: ({ onChange, value }: { onChange: (value: string) => void; value?: string }) => (
    <select aria-label={COPY.project.connection} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Choose</option>
      <option value={ONBOARD_PLUGIN.GITHUB}>GitHub</option>
    </select>
  ),
}));

vi.mock('./use-guide', () => ({ useGuide: () => '' }));

const checkName = vi.mocked(API.project.checkName);
const storeSet = vi.mocked(API.store.set);

const setup = (overrides: Parameters<typeof makeOnboardContext>[0] = {}) => {
  const value = makeOnboardContext(overrides);
  renderOnboard(<Step1 />, value);
  return value;
};

describe('Step1 project checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the project details and step when checking the name fails, then advances after a successful retry', async () => {
    let rejectCheck: ((error: Error) => void) | undefined;
    checkName
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectCheck = reject;
          }),
      )
      .mockResolvedValue({ exist: false });
    const value = setup();
    const next = screen.getByRole('button', { name: COPY.next });

    fireEvent.click(next);
    await waitForOnboardActionPending(next);
    await act(async () => {
      rejectCheck?.(new Error('fixed safe failure'));
    });
    await waitForOnboardActionSettled(next);

    expect(storeSet).not.toHaveBeenCalled();
    expect(value.setStep).not.toHaveBeenCalled();
    expect(value.projectName).toBe('alpha');
    expect(value.plugin).toBe(ONBOARD_PLUGIN.GITHUB);
    expect(message.error).toHaveBeenCalledWith('Could not check this project name. Try again.');

    fireEvent.click(next);
    await waitFor(() => expect(value.setStep).toHaveBeenCalledWith(WIZARD_STEP.CONNECTION));
    expect(checkName).toHaveBeenCalledTimes(2);
    expect(storeSet).toHaveBeenCalledTimes(1);
  });

  it('keeps a duplicate project name blocked', async () => {
    checkName.mockResolvedValue({ exist: true });
    const value = setup();

    fireEvent.click(screen.getByRole('button', { name: COPY.next }));
    await waitFor(() => expect(checkName).toHaveBeenCalledTimes(1));

    expect(storeSet).not.toHaveBeenCalled();
    expect(value.setStep).not.toHaveBeenCalled();
  });

  it('does not check a name when required details are missing', () => {
    setup({ projectName: '', plugin: undefined });

    expect(screen.getByRole('button', { name: COPY.next }).hasAttribute('disabled')).toBe(true);
    expect(checkName).not.toHaveBeenCalled();
    expect(storeSet).not.toHaveBeenCalled();
  });
});
