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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GRAFANA_ROLE } from '@/api/grafana-users/constants';

import { COPY, PASSWORD_MIN_LENGTH } from '../../constants';

import {
  clickProjectOption,
  cleanupAddUserMocks,
  devlakeUser,
  fillAdd,
  grafana,
  listUsers,
  resetAddUserMocks,
  setup,
  submit,
} from './add-user-modal-helpers';

const PROJECT_NAME = 'alpha';

const selectDevLakeUser = async () => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: COPY.add.fillFrom.label }));
  fireEvent.click(await screen.findByTitle('Dev Ann (dev@example.com)'));
};

const setRole = async (role: string) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: new RegExp(COPY.add.role.label) }));
  fireEvent.click(await screen.findByText(role, { selector: '.ant-select-item-option-content' }));
};

const selectClear = (label: string) => {
  const select = screen.getByRole('combobox', { name: label }).closest('.ant-select');
  const clear = select?.querySelector('.ant-select-clear');
  if (!(clear instanceof HTMLElement)) throw new Error('The picker clear control is missing');
  fireEvent.mouseDown(clear);
  fireEvent.click(clear);
};

const inputValue = (label: string) => (screen.getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement).value;
const hasSelectText = (selector: string, value: string) =>
  [...document.querySelectorAll(selector)].some((element) => element.textContent === value);

const setupPickedUser = async () => {
  listUsers.mockResolvedValue({ users: [devlakeUser], count: 1, page: 1, pageSize: 25 });
  setup();
  await selectDevLakeUser();
};

const expectPickerReset = () => {
  const passwordLength = inputValue(COPY.password.label).length;
  expect(inputValue(COPY.add.email.label)).toBe('');
  expect(inputValue(COPY.add.name.label)).toBe('');
  expect(passwordLength).toBe(0);
  expect(hasSelectText('.ant-select-placeholder', COPY.add.fillFrom.placeholder)).toBeTruthy();
};

describe('AddUserModal DevLake user picker', () => {
  beforeEach(resetAddUserMocks);
  afterEach(cleanupAddUserMocks);

  it('clears the picked template and resets every form field to its defaults', async () => {
    await setupPickedUser();
    await setRole(GRAFANA_ROLE.EDITOR);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: COPY.projects.label }));
    await clickProjectOption(PROJECT_NAME);

    selectClear(COPY.add.fillFrom.label);
    expectPickerReset();

    fillAdd();
    fireEvent.click(submit(COPY.add.submit));
    await waitFor(() => expect(grafana.createUser).toHaveBeenCalledTimes(1));
    expect(grafana.createUser.mock.calls[0][0].role).toBe(GRAFANA_ROLE.VIEWER);
    expect(grafana.createUser.mock.calls[0][0].projectNames).toEqual([]);
  });

  it.each([
    ['email', COPY.add.email.label, 'edited@example.com'],
    ['name', COPY.add.name.label, 'Edited Name'],
  ])(
    'detaches the picker when the prefilled %s changes and preserves the remaining form',
    async (_field, label, value) => {
      await setupPickedUser();
      await setRole(GRAFANA_ROLE.EDITOR);
      fireEvent.mouseDown(screen.getByRole('combobox', { name: COPY.projects.label }));
      await clickProjectOption(PROJECT_NAME);
      const generatedPassword = inputValue(COPY.password.label);
      expect(generatedPassword.length >= PASSWORD_MIN_LENGTH).toBeTruthy();

      fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });

      expect(inputValue(label)).toBe(value);
      expect(inputValue(label === COPY.add.email.label ? COPY.add.name.label : COPY.add.email.label)).toBe(
        label === COPY.add.email.label ? devlakeUser.displayName : devlakeUser.email,
      );
      expect(inputValue(COPY.password.label) === generatedPassword).toBeTruthy();
      expect(hasSelectText('.ant-select-placeholder', COPY.add.fillFrom.placeholder)).toBeTruthy();

      fireEvent.click(submit(COPY.add.submit));
      await waitFor(() => expect(grafana.createUser).toHaveBeenCalledTimes(1));
      expect(grafana.createUser.mock.calls[0][0].role).toBe(GRAFANA_ROLE.EDITOR);
      expect(grafana.createUser.mock.calls[0][0].projectNames).toEqual([PROJECT_NAME]);
    },
  );

  it('does not restore a cleared selection when a later search result arrives', async () => {
    await setupPickedUser();
    selectClear(COPY.add.fillFrom.label);

    listUsers.mockResolvedValue({ users: [devlakeUser], count: 1, page: 1, pageSize: 25 });
    fireEvent.change(screen.getByRole('combobox', { name: COPY.add.fillFrom.label }), { target: { value: 'dev' } });
    await waitFor(
      () => expect(listUsers).toHaveBeenCalledWith(expect.objectContaining({ keyword: 'dev' }), expect.anything()),
      {
        timeout: 1000,
      },
    );
    await screen.findByTitle('Dev Ann (dev@example.com)');

    expectPickerReset();
  });
});
