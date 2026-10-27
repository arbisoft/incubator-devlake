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

import { GRAFANA_ROLE } from '@/api/grafana-users/constants';

import { COPY } from '../../constants';

import {
  cleanupAddUserMocks,
  devlakeUser,
  EMAIL,
  fillAdd,
  grafana,
  listUsers,
  PASSWORD,
  resetAddUserMocks,
  setup,
  submit,
  USER_NAME,
} from './add-user-modal-helpers';

describe('AddUserModal', () => {
  beforeEach(resetAddUserMocks);
  afterEach(cleanupAddUserMocks);

  it('creates the account with a normalised email and hands the password to the one-time dialog', async () => {
    const props = setup();
    fillAdd({ email: ' Ann@Example.com ' });
    fireEvent.click(submit(COPY.add.submit));
    await waitFor(() => expect(props.onPassword).toHaveBeenCalled());
    expect(grafana.createUser).toHaveBeenCalledWith({
      email: EMAIL,
      name: USER_NAME,
      role: GRAFANA_ROLE.VIEWER,
      projectNames: [],
      password: PASSWORD,
    });
    expect(props.onPassword).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD });
    expect(props.onChanged).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
    expect(vi.mocked(message.success).mock.calls.flat().join(' ')).not.toContain(PASSWORD);
  });

  it('fills the email, name and a generated password from a picked DevLake user', async () => {
    listUsers.mockResolvedValue({ users: [devlakeUser], count: 1, page: 1, pageSize: 25 });
    setup();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: COPY.add.fillFrom.label }));
    fireEvent.click(await screen.findByTitle('Dev Ann (dev@example.com)'));
    await waitFor(() =>
      expect((screen.getByLabelText(new RegExp(`^${COPY.add.email.label}`)) as HTMLInputElement).value).toBe(
        'dev@example.com',
      ),
    );
    expect((screen.getByLabelText(new RegExp(`^${COPY.add.name.label}`)) as HTMLInputElement).value).toBe('Dev Ann');
    expect((screen.getByLabelText(new RegExp(`^${COPY.password.label}`)) as HTMLInputElement).value).toHaveLength(24);
  });
});
