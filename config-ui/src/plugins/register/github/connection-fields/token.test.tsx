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

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from './constants';
import { Token } from './token';

const api = vi.hoisted(() => ({ test: vi.fn(), testOld: vi.fn() }));
const OLD_TOKEN_MESSAGE = 'Old token passed.';

vi.mock('@/api', () => ({ default: { connection: api } }));

const props = (type: 'create' | 'update' = 'create', connectionId?: ID) => ({
  type,
  connectionId,
  endpoint: 'https://api.github.com',
  proxy: '',
  initialValue: '',
  value: '',
  error: '',
  setValue: vi.fn(),
  setError: vi.fn(),
});

const renderAndTestInitialToken = async (assertReady: () => void) => {
  renderWithTheme(<Token {...props()} />);

  const input = screen.getByPlaceholderText(COPY.tokenPlaceholder);
  fireEvent.change(input, { target: { value: 'github_pat_old' } });
  fireEvent.blur(input);
  await waitFor(assertReady);

  return input;
};

describe('GitHub token feedback', () => {
  beforeEach(() => vi.resetAllMocks());

  it('shows fine-grained guidance before testing and the verification disclaimer on success', async () => {
    api.testOld.mockResolvedValue({
      success: true,
      login: 'fine-user',
      warning: false,
      message: 'Token authenticated.',
    });
    renderWithTheme(<Token {...props()} />);

    const input = screen.getByPlaceholderText(COPY.tokenPlaceholder);
    fireEvent.change(input, { target: { value: 'github_pat_example' } });

    expect(screen.getByText(/Select the intended resource owner and repositories/)).toBeTruthy();
    expect(screen.getByText(/Actions, Contents, Discussions, Issues, Metadata and Pull requests/)).toBeTruthy();

    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByText(COPY.fineGrainedSuccess)).toBeTruthy());
    expect(screen.getByText('Token authenticated.')).toBeTruthy();
    expect(screen.queryByText(COPY.classicSuccess)).toBeNull();
  });

  it('shows authentication feedback for an invalid fine-grained token without classic scopes', async () => {
    api.testOld.mockResolvedValue({ success: false, message: 'Bad credentials' });
    renderWithTheme(<Token {...props()} />);

    const input = screen.getByPlaceholderText(COPY.tokenPlaceholder);
    fireEvent.change(input, { target: { value: 'github_pat_invalid' } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByText('Bad credentials')).toBeTruthy());
    expect(screen.queryByText(/repo:status/)).toBeNull();
  });

  it('shows a safe fallback when a new token test fails unexpectedly', async () => {
    const privateDetail = 'request failed with private response details';
    api.testOld.mockRejectedValue(new Error(privateDetail));
    renderWithTheme(<Token {...props()} />);

    const input = screen.getByPlaceholderText(COPY.tokenPlaceholder);
    fireEvent.change(input, { target: { value: 'github_pat_test' } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByText(COPY.tokenTestFailed)).toBeTruthy());
    expect(screen.queryByText(privateDetail)).toBeNull();
  });

  it('retests an edited token instead of keeping its previous result', async () => {
    api.testOld
      .mockResolvedValueOnce({ success: true, login: 'old-user', warning: false, message: OLD_TOKEN_MESSAGE })
      .mockResolvedValueOnce({ success: false, message: 'New token was rejected.' });
    const input = await renderAndTestInitialToken(() => expect(screen.getByText(OLD_TOKEN_MESSAGE)).toBeTruthy());

    fireEvent.change(input, { target: { value: 'github_pat_new' } });
    expect(screen.queryByText(OLD_TOKEN_MESSAGE)).toBeNull();
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByText('New token was rejected.')).toBeTruthy());
    expect(api.testOld).toHaveBeenCalledTimes(2);
  });

  it('ignores a response when the token value changed while its test was pending', async () => {
    let resolveOldTest:
      ((value: { success: boolean; login: string; warning: boolean; message: string }) => void) | undefined;
    api.testOld.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOldTest = resolve;
        }),
    );
    api.testOld.mockResolvedValueOnce({
      success: true,
      login: 'new-user',
      warning: false,
      message: 'New token passed.',
    });
    const input = await renderAndTestInitialToken(() => expect(api.testOld).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { value: 'github_pat_new' } });
    resolveOldTest?.({ success: true, login: 'old-user', warning: false, message: OLD_TOKEN_MESSAGE });
    await waitFor(() => expect(screen.queryByText(OLD_TOKEN_MESSAGE)).toBeNull());

    fireEvent.blur(input);
    await waitFor(() => expect(screen.getByText('New token passed.')).toBeTruthy());
    expect(api.testOld).toHaveBeenCalledTimes(2);
  });

  it('clears saved-token loading and shows safe feedback when loading fails', async () => {
    api.test.mockRejectedValue(new Error('network error with private details'));
    const tokenProps = props('update', 1);
    tokenProps.initialValue = 'github_pat_saved********Suffix12';
    tokenProps.value = tokenProps.initialValue;
    renderWithTheme(<Token {...tokenProps} />);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(COPY.savedTokensLoadFailed));
    const input = screen.getByPlaceholderText(COPY.tokenPlaceholder) as HTMLInputElement;
    expect(input.value).toBe(tokenProps.initialValue);
    expect(tokenProps.setValue).toHaveBeenLastCalledWith(tokenProps.initialValue);
    expect(screen.queryByText('network error with private details')).toBeNull();
  });

  it('keeps safe messages and classic guidance for mixed saved-token results', async () => {
    api.test.mockResolvedValue({
      success: false,
      message: 'One token failed.',
      tokens: [
        {
          token: 'ghp_saved****************Suffix12',
          success: false,
          login: 'classic-user',
          warning: false,
          message:
            'stack trace\nWraps: (1) Classic token is missing required permissions.\nAuthorization: Bearer secret-value',
        },
        {
          token: 'github_pat_saved****************Suffix12',
          success: true,
          login: 'fine-user',
          warning: false,
          message: 'Fine-grained token authenticated.',
        },
      ],
    });
    renderWithTheme(<Token {...props('update', 1)} />);

    await waitFor(() => expect(screen.getByText('Classic token is missing required permissions.')).toBeTruthy());
    expect(screen.queryByText(COPY.classicInvalidScopes)).toBeNull();
    expect(screen.queryByText(/Authorization:|secret-value/)).toBeNull();
    expect(screen.getByText('Fine-grained token authenticated.')).toBeTruthy();
    expect(screen.getByText(COPY.fineGrainedSuccess)).toBeTruthy();
  });

  it('keeps classic missing-scope and private-repository guidance when no backend message exists', async () => {
    api.testOld.mockResolvedValue({ success: false });
    renderWithTheme(<Token {...props()} />);

    const input = screen.getByPlaceholderText(COPY.tokenPlaceholder);
    fireEvent.change(input, { target: { value: 'ghp_invalid' } });
    fireEvent.blur(input);

    await waitFor(() => expect(screen.getByText(COPY.classicInvalidScopes)).toBeTruthy());
    expect(screen.getByText(COPY.classicPrivateRepositories)).toBeTruthy();
  });
});
