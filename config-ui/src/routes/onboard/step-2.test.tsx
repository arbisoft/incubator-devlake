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

import { createDeferred, makeOnboardContext, onboardTree, renderOnboard } from './__tests__/onboard.test-utils';
import { COPY, ONBOARD_PLUGIN, WIZARD_STEP } from './constants';
import { Step2 } from './step-2';

vi.mock('antd', async (importOriginal) =>
  (await import('./__tests__/onboard-antd-mock')).mockOnboardAntd(importOriginal),
);

vi.mock('@/api', () => ({
  default: { connection: { testOld: vi.fn(), create: vi.fn() }, store: { set: vi.fn() } },
}));

vi.mock('@/plugins', async () => {
  const { Auth } = await import('@/plugins/register/bitbucket/connection-fields');
  return {
    getPluginConfig: vi.fn((plugin: string) => ({ name: plugin, connection: { fields: [null, Auth] } })),
  };
});

vi.mock('@/plugins/components/connection-form/fields/token', () => ({
  ConnectionToken: ({ setValue }: { setValue: (value?: string) => void }) => (
    <button type="button" onClick={() => setValue('present')}>
      Provide credential
    </button>
  ),
}));

vi.mock('./use-guide', () => ({ useGuide: () => '' }));

const testOld = vi.mocked(API.connection.testOld);
const createConnection = vi.mocked(API.connection.create);
const storeSet = vi.mocked(API.store.set);
const CONNECTION_ID = 41;
const NEXT_BUTTON = COPY.next;
const CONNECT_BUTTON = COPY.connection.connect;
const CREDENTIAL_BUTTON = 'Provide credential';
const SUCCESSFUL_TEST_MESSAGE = 'safe connection success';
type ConnectionTestResponse = Awaited<ReturnType<typeof API.connection.testOld>>;
type DeferredConnectionTest = ReturnType<typeof createDeferred<ConnectionTestResponse>>;

const setup = (plugin = ONBOARD_PLUGIN.GITHUB) => {
  const value = makeOnboardContext({ plugin, step: WIZARD_STEP.CONNECTION });
  const view = renderOnboard(<Step2 />, value);
  return { value, ...view };
};

const next = () => screen.getByRole('button', { name: NEXT_BUTTON });

const getConnectButton = () => {
  const button = screen.getByText(CONNECT_BUTTON).closest('button');
  if (!button) {
    throw new Error('Connect button is unavailable.');
  }
  return button;
};

const waitForPending = async () => {
  await waitFor(() => expect(getConnectButton().classList.contains('ant-btn-loading')).toBe(true));
};

const waitForSettled = async () => {
  await waitFor(() => expect(getConnectButton().classList.contains('ant-btn-loading')).toBe(false));
};

const resolveSuccessfulConnectionTest = async (result: DeferredConnectionTest) => {
  await act(async () => {
    result.resolve({ success: true, message: SUCCESSFUL_TEST_MESSAGE });
    await result.promise;
  });
  await waitForSettled();
};

describe('Step2 connection tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testOld.mockReset();
    createConnection.mockReset().mockResolvedValue({
      id: CONNECTION_ID,
      name: 'github-connection',
      endpoint: '',
      proxy: '',
    });
    storeSet.mockReset().mockResolvedValue(undefined);
  });

  it('keeps a failed credential test blocked and allows a successful retry to create the connection', async () => {
    const failedTest = createDeferred<Awaited<ReturnType<typeof API.connection.testOld>>>();
    const successfulTest = createDeferred<Awaited<ReturnType<typeof API.connection.testOld>>>();
    testOld.mockReturnValueOnce(failedTest.promise).mockReturnValueOnce(successfulTest.promise);
    const { value } = setup();
    fireEvent.click(screen.getByRole('button', { name: CREDENTIAL_BUTTON }));
    fireEvent.click(getConnectButton());
    await waitForPending();
    expect(next().hasAttribute('disabled')).toBe(true);
    await act(async () => {
      failedTest.resolve({ success: false, message: 'safe connection failure' });
      await failedTest.promise;
    });
    await waitForSettled();

    expect(message.error).toHaveBeenCalledWith(COPY.connection.connectFailed);
    expect(message.success).not.toHaveBeenCalledWith(COPY.connection.connectSuccess);
    expect(next().hasAttribute('disabled')).toBe(true);
    expect(Boolean(testOld.mock.calls[0]?.[1].token)).toBe(true);
    expect(createConnection).not.toHaveBeenCalled();
    expect(storeSet).not.toHaveBeenCalled();

    fireEvent.click(getConnectButton());
    await waitForPending();
    await resolveSuccessfulConnectionTest(successfulTest);

    expect(message.success).toHaveBeenCalledWith(COPY.connection.connectSuccess);
    expect(next().hasAttribute('disabled')).toBe(false);
    expect(Boolean(testOld.mock.calls[1]?.[1].token)).toBe(true);
    fireEvent.click(next());
    await waitFor(() => expect(value.setStep).toHaveBeenCalledWith(WIZARD_STEP.SCOPE));
    expect(createConnection).toHaveBeenCalledTimes(1);
    expect(Boolean(createConnection.mock.calls[0]?.[1].token)).toBe(true);
    expect(storeSet).toHaveBeenCalledTimes(1);
  });

  it('disables Next after a failed retest even when an earlier test succeeded', async () => {
    const successfulTest = createDeferred<Awaited<ReturnType<typeof API.connection.testOld>>>();
    const failedRetest = createDeferred<Awaited<ReturnType<typeof API.connection.testOld>>>();
    testOld.mockReturnValueOnce(successfulTest.promise).mockReturnValueOnce(failedRetest.promise);
    setup();
    fireEvent.click(screen.getByRole('button', { name: CREDENTIAL_BUTTON }));
    fireEvent.click(getConnectButton());
    await waitForPending();
    await resolveSuccessfulConnectionTest(successfulTest);
    expect(next().hasAttribute('disabled')).toBe(false);

    fireEvent.click(getConnectButton());
    await waitForPending();
    const nextDisabledDuringRetest = next().hasAttribute('disabled');
    await act(async () => {
      failedRetest.resolve({ success: false, message: 'safe connection failure' });
      await failedRetest.promise;
    });
    await waitFor(() => expect(message.error).toHaveBeenCalledWith(COPY.connection.connectFailed));

    expect(nextDisabledDuringRetest).toBe(true);
    expect(next().hasAttribute('disabled')).toBe(true);
    expect(createConnection).not.toHaveBeenCalled();
    expect(storeSet).not.toHaveBeenCalled();
  });

  it('keeps Next blocked after an HTTP rejection and permits a successful retry', async () => {
    const rejectedTest = createDeferred<Awaited<ReturnType<typeof API.connection.testOld>>>();
    const successfulRetry = createDeferred<Awaited<ReturnType<typeof API.connection.testOld>>>();
    testOld.mockReturnValueOnce(rejectedTest.promise).mockReturnValueOnce(successfulRetry.promise);
    const { value } = setup();
    fireEvent.click(screen.getByRole('button', { name: CREDENTIAL_BUTTON }));
    fireEvent.click(getConnectButton());
    await waitForPending();
    await act(async () => {
      rejectedTest.reject(new Error('fixed safe failure'));
      await rejectedTest.promise.catch(() => undefined);
    });
    await waitForSettled();

    expect(message.error).toHaveBeenCalledWith(COPY.connection.connectFailed);
    expect(next().hasAttribute('disabled')).toBe(true);
    expect(Boolean(testOld.mock.calls[0]?.[1].token)).toBe(true);

    fireEvent.click(getConnectButton());
    await waitForPending();
    await resolveSuccessfulConnectionTest(successfulRetry);
    expect(next().hasAttribute('disabled')).toBe(false);
    expect(value.setStep).not.toHaveBeenCalled();
  });

  it('renders Bitbucket auth as a component with the same defaults while switching plugins', async () => {
    const github = makeOnboardContext({ plugin: ONBOARD_PLUGIN.GITHUB });
    const bitbucket = makeOnboardContext({ plugin: ONBOARD_PLUGIN.BITBUCKET });
    const view = renderOnboard(<Step2 />, github);

    view.rerender(onboardTree(<Step2 />, bitbucket));

    const endpoint = await screen.findByDisplayValue('https://api.bitbucket.org/2.0/');
    expect((endpoint as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('radio', { name: 'API Token (Recommended)' }) as HTMLInputElement).checked).toBe(true);
    expect(next().hasAttribute('disabled')).toBe(true);

    view.rerender(onboardTree(<Step2 />, github));
    view.rerender(onboardTree(<Step2 />, bitbucket));
    expect(screen.getByRole('radio', { name: 'API Token (Recommended)' })).toBeTruthy();
  });
});
