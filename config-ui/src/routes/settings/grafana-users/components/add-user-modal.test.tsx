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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COPY, PASSWORD_MIN_LENGTH } from '../constants';

import {
  cleanupAddUserMocks,
  disabledAttribute as ARIA_DISABLED_ATTRIBUTE,
  disabledValue as ARIA_DISABLED_VALUE,
  fillAdd,
  grafana,
  projectList,
  resetAddUserMocks,
  setup,
  submit,
} from './__tests__/add-user-modal-helpers';

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

    fillAdd({ password: 'x'.repeat(PASSWORD_MIN_LENGTH - 1) });
    expect(submit(COPY.add.submit).getAttribute(ARIA_DISABLED_ATTRIBUTE)).toBe(ARIA_DISABLED_VALUE.TRUE);
    fillAdd({ password: 'x'.repeat(PASSWORD_MIN_LENGTH) });
    expect(submit(COPY.add.submit).getAttribute(ARIA_DISABLED_ATTRIBUTE)).toBe(ARIA_DISABLED_VALUE.FALSE);
    await waitFor(() => expect(projectList).toHaveBeenCalled());
  });
});

vi.mock('antd', async (importOriginal) =>
  (await import('../../__tests__/test-utils')).withMockedAntdMessage(importOriginal),
);

vi.mock('@/api', async () => (await import('../../__tests__/test-utils')).mockGrafanaUsersApi());
