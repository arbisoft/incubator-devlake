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

import { COPY as CONNECTION_HEALTH_COPY } from '@/features/connections/constants';
import { messageMock } from '@/ui/__tests__/mock-message';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import {
  get,
  mocks,
  resetConnectionFormMocks,
  setPluginConfig,
  test,
  testOld,
} from './__tests__/connection-form.test-utils';
import { COPY } from './constants';

const { ConnectionForm } = await import('./connection-form');

const renderCreate = (onSuccess = vi.fn()) => {
  renderWithTheme(<ConnectionForm plugin="gitlab" onSuccess={onSuccess} />);
  return onSuccess;
};

const expectFailureToRetry = async (failureMessage: string, successMessage: string) => {
  fireEvent.click(screen.getByRole('button', { name: COPY.test.label }));
  await waitFor(() => expect(messageMock.error).toHaveBeenCalledWith(failureMessage));
  expect(messageMock.success).not.toHaveBeenCalled();
  expect(messageMock.error).toHaveBeenCalledOnce();
  const testButton = screen.getByRole('button', { name: /Test Connection$/ }) as HTMLButtonElement;
  await waitFor(() => expect(testButton.disabled).toBe(false));

  fireEvent.click(testButton);
  await waitFor(() => expect(messageMock.success).toHaveBeenCalledWith(successMessage));
  expect(messageMock.error).toHaveBeenCalledOnce();
};

describe('ConnectionForm test actions', () => {
  beforeEach(() => {
    resetConnectionFormMocks();
  });

  it('turns a resolved unsuccessful create test into one safe error and allows a successful retry', async () => {
    testOld
      .mockResolvedValueOnce({ success: false, message: 'attached stack trace\nWraps: (2) Plugin rejected request' })
      .mockResolvedValueOnce({ success: true, message: mocks.successMessage });
    renderCreate();
    await expectFailureToRetry('Plugin rejected request', COPY.test.success);
    expect(testOld).toHaveBeenCalledTimes(2);
  });

  it('turns a resolved unsuccessful saved update into a safe error', async () => {
    mocks.connection = { endpoint: mocks.savedEndpoint, name: mocks.savedName };
    get.mockResolvedValue({ id: 7, endpoint: mocks.savedEndpoint, name: mocks.savedName, proxy: '' });
    test.mockResolvedValue({ success: false, message: 'attached stack trace\nWraps: (2) Update rejected' });
    renderWithTheme(<ConnectionForm plugin="gitlab" connectionId={7} />);

    await waitFor(() => expect(get).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: COPY.test.label }));

    await waitFor(() => expect(messageMock.error).toHaveBeenCalledWith('Update rejected'));
    expect(messageMock.success).not.toHaveBeenCalled();
  });

  it('formats rejected test requests with a cleaned response reason', async () => {
    testOld.mockRejectedValue({
      response: { status: 400, data: { message: 'attached stack trace\nWraps: (2) Test request rejected' } },
    });
    renderCreate();

    fireEvent.click(screen.getByRole('button', { name: COPY.test.label }));

    await waitFor(() => expect(messageMock.error).toHaveBeenCalledWith('Test request rejected'));
    expect(messageMock.success).not.toHaveBeenCalled();
  });

  it('uses mapped safe copy when a rejected test request has no server reason', async () => {
    testOld.mockRejectedValue({ response: { status: 400, data: {} }, message: 'untrusted text' });
    renderCreate();

    fireEvent.click(screen.getByRole('button', { name: COPY.test.label }));

    await waitFor(() => expect(messageMock.error).toHaveBeenCalledWith(CONNECTION_HEALTH_COPY.testFailed.fallback));
    expect(messageMock.error).toHaveBeenCalledOnce();
  });

  it('shows one cleaned failure in custom-message mode and preserves the custom success message', async () => {
    setPluginConfig(true);
    testOld
      .mockResolvedValueOnce({ success: false, message: 'attached stack trace\nWraps: (2) Custom mode rejected' })
      .mockResolvedValueOnce({ success: true, message: 'Custom test passed' });
    renderCreate();
    await expectFailureToRetry('Custom mode rejected', 'Custom test passed');
    expect(testOld).toHaveBeenCalledTimes(2);
  });
});

describe('ConnectionForm save actions', () => {
  beforeEach(() => {
    resetConnectionFormMocks();
  });

  it('keeps edited values after a response failure and lets the user retry', async () => {
    const onSuccess = vi.fn();
    mocks.save
      .mockRejectedValueOnce({
        response: { status: 400, data: { message: 'attached stack trace\nWraps: (2) Save rejected' } },
      })
      .mockResolvedValueOnce({ id: 8 });
    renderCreate(onSuccess);
    fireEvent.click(screen.getByRole('button', { name: 'Change endpoint' }));

    fireEvent.click(screen.getByRole('button', { name: COPY.save.label }));
    await waitFor(() => expect(messageMock.error).toHaveBeenCalledWith('Save rejected'));
    expect(screen.getByTestId('endpoint-value').textContent).toBe(mocks.updatedEndpoint);
    expect(onSuccess).not.toHaveBeenCalled();
    const saveButton = screen.getByRole('button', { name: /Save Connection$/ }) as HTMLButtonElement;
    await waitFor(() => expect(saveButton.disabled).toBe(false));

    fireEvent.click(saveButton);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(8));
  });

  it('keeps the duplicate copy ahead of a server response reason', async () => {
    mocks.save.mockRejectedValue({ response: { status: 409, data: { message: 'duplicate response details' } } });
    renderCreate();

    fireEvent.click(screen.getByRole('button', { name: COPY.save.label }));

    await waitFor(() => expect(messageMock.error).toHaveBeenCalledWith(COPY.save.duplicate));
    expect(messageMock.error).toHaveBeenCalledOnce();
  });
});

describe('ConnectionForm defaults', () => {
  beforeEach(() => {
    resetConnectionFormMocks();
  });

  it('keeps create defaults without fetching saved details', async () => {
    testOld.mockResolvedValue({ success: true, message: mocks.successMessage });
    renderCreate();

    await waitFor(() => expect(screen.getByTestId('endpoint-value').textContent).toBe(mocks.defaultEndpoint));
    expect(get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: COPY.test.label }));
    await waitFor(() => expect(testOld).toHaveBeenCalledOnce());
    expect(testOld.mock.calls[0][1]).toMatchObject({ endpoint: mocks.defaultEndpoint });
  });
});
