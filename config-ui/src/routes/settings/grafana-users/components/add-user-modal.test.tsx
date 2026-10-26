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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GRAFANA_ERROR_CODE } from '@/api/grafana-users/constants';

import { COPY } from '../constants';

import {
  cleanupAddUserMocks,
  disabledAttribute as ARIA_DISABLED_ATTRIBUTE,
  disabledValue as ARIA_DISABLED_VALUE,
  EMAIL,
  fillAdd,
  grafana,
  PASSWORD,
  projectList,
  resetAddUserMocks,
  setup,
  submit,
} from './__tests__/add-user-modal-helpers';
import { expectPasswordRetained, makePasswordError, waitForPasswordFormReady } from './__tests__/password-error';

import './__tests__/add-user-modal-basic-cases';
import './__tests__/add-user-modal-picker-cases';
import './__tests__/add-user-modal-retry-cases';

describe('AddUserModal initial form', () => {
  beforeEach(resetAddUserMocks);
  afterEach(cleanupAddUserMocks);

  it('keeps the submit disabled until the email, name and password are valid', async () => {
    setup();
    expect(submit(COPY.add.submit).getAttribute(ARIA_DISABLED_ATTRIBUTE)).toBe(ARIA_DISABLED_VALUE.TRUE);
    fillAdd({ email: 'not-an-email' });
    expect(await screen.findByText(COPY.add.invalidEmail)).toBeTruthy();
    fireEvent.click(submit(COPY.add.submit));
    expect(grafana.createUser).not.toHaveBeenCalled();

    fillAdd({ password: 'Abcdefghijkl1!' });
    expect(submit(COPY.add.submit).getAttribute(ARIA_DISABLED_ATTRIBUTE)).toBe(ARIA_DISABLED_VALUE.TRUE);
    fillAdd({ password: 'Abcdefghijklm1!' });
    expect(submit(COPY.add.submit).getAttribute(ARIA_DISABLED_ATTRIBUTE)).toBe(ARIA_DISABLED_VALUE.FALSE);
    await waitFor(() => expect(projectList).toHaveBeenCalled());
  });

  it('keeps the failed form ready for retry', async () => {
    const error = makePasswordError(PASSWORD, 409, GRAFANA_ERROR_CODE.USER_EXISTS);
    grafana.createUser.mockRejectedValueOnce(error);

    const props = setup();
    fillAdd();
    fireEvent.click(submit(COPY.add.submit));
    await waitFor(() => expect(message.error).toHaveBeenCalledWith(COPY.errors[GRAFANA_ERROR_CODE.USER_EXISTS]));

    const email = screen.getByLabelText(new RegExp(`^${COPY.add.email.label}`)) as HTMLInputElement;
    const password = screen.getByLabelText(new RegExp(`^${COPY.password.label}`)) as HTMLInputElement;
    expectPasswordRetained(password, PASSWORD);
    expect(email.value === EMAIL).toBeTruthy();
    expect(props.onClose).not.toHaveBeenCalled();
    await waitForPasswordFormReady(submit(COPY.add.submit));

    fireEvent.click(submit(COPY.add.submit));
    await waitFor(() => expect(props.onPassword).toHaveBeenCalledOnce());
    expect(grafana.createUser).toHaveBeenCalledTimes(2);
    expect(props.onPassword.mock.calls[0]?.[0].password === PASSWORD).toBeTruthy();
  });
});

vi.mock('antd', async (importOriginal) =>
  (await import('../../__tests__/test-utils')).withMockedAntdMessage(importOriginal),
);

vi.mock('@/api', async () => (await import('../../__tests__/test-utils')).mockGrafanaUsersApi());
