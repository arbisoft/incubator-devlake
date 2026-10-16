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
import { message } from 'antd';
import { describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { GRAFANA_ERROR_CODE, GRAFANA_ROLE } from '@/api/grafana-users/constants';
import type { GrafanaUser } from '@/api/grafana-users/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from '../../constants';
import { SetPasswordModal } from '../set-password-modal';

import { expectPasswordRetained, makePasswordError, waitForPasswordFormReady } from './password-error';

const EMAIL = 'ann@example.com';
const PASSWORD = 'a-long-enough-password';
const ARIA_TRUE = 'true';
const grafana = vi.mocked(API.grafanaUsers);
const user = (): GrafanaUser => ({
  id: 5,
  email: EMAIL,
  name: 'Ann Lee',
  role: GRAFANA_ROLE.VIEWER,
  disabled: false,
  sso: false,
  protected: false,
  projects: [],
});
const callbacks = () => ({ onClose: vi.fn(), onChanged: vi.fn(), onPassword: vi.fn() });
const submit = () => screen.getByRole('button', { name: new RegExp(`${COPY.setPassword.submit}$`) });
const typePassword = (value: string) =>
  fireEvent.change(screen.getByLabelText(new RegExp(`^${COPY.password.label}`)), { target: { value } });
const submitPassword = (password: string) => {
  const props = callbacks();
  renderWithTheme(<SetPasswordModal open user={user()} {...props} />);
  typePassword(password);
  fireEvent.click(submit());
  return props;
};

describe('SetPasswordModal', () => {
  it('needs a long enough password, then sets it and hands it to the one-time dialog', async () => {
    const props = callbacks();
    renderWithTheme(<SetPasswordModal open user={user()} {...props} />);
    typePassword('short');
    expect(submit().getAttribute('aria-disabled')).toBe(ARIA_TRUE);
    fireEvent.click(submit());
    expect(grafana.setPassword).not.toHaveBeenCalled();

    typePassword(PASSWORD);
    fireEvent.click(submit());
    await waitFor(() => expect(props.onPassword).toHaveBeenCalled());
    expect(grafana.setPassword).toHaveBeenCalledWith(5, PASSWORD);
    expect(props.onPassword).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD });
    expect(props.onClose).toHaveBeenCalled();
    expect((screen.getByLabelText(new RegExp(`^${COPY.password.label}`)) as HTMLInputElement).value).toBe('');
  });

  it('generates a password of 24 characters', () => {
    renderWithTheme(<SetPasswordModal open user={user()} {...callbacks()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(COPY.password.generate) }));
    expect((screen.getByLabelText(new RegExp(`^${COPY.password.label}`)) as HTMLInputElement).value).toHaveLength(24);
  });

  it('keeps a failed password update ready for retry', async () => {
    const error = makePasswordError(PASSWORD, 403, GRAFANA_ERROR_CODE.PASSWORD_REJECTED);
    grafana.setPassword.mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);
    const props = submitPassword(PASSWORD);
    await waitFor(() => expect(message.error).toHaveBeenCalledWith(COPY.errors[GRAFANA_ERROR_CODE.PASSWORD_REJECTED]));

    const password = screen.getByLabelText(new RegExp(`^${COPY.password.label}`)) as HTMLInputElement;
    expectPasswordRetained(password, PASSWORD);
    expect(props.onClose).not.toHaveBeenCalled();

    await waitFor(() => expect(submit().getAttribute('aria-disabled')).not.toBe(ARIA_TRUE));
    await waitForPasswordFormReady(submit());
    fireEvent.click(submit());
    await waitFor(() => expect(props.onPassword).toHaveBeenCalledOnce());
    expect(grafana.setPassword).toHaveBeenCalledTimes(2);
    expect(props.onPassword.mock.calls[0]?.[0].password === PASSWORD).toBeTruthy();
  });
});
