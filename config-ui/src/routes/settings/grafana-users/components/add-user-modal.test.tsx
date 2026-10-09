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

import API from '@/api';
import { ACCESS_ROLE, ACCESS_STATUS, type AccessUser } from '@/api/access';
import { GRAFANA_ERROR_CODE, GRAFANA_ROLE } from '@/api/grafana-users/constants';
import type { GrafanaUser } from '@/api/grafana-users/types';
import type { IProject } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY, GRAFANA_ERROR_MAP, PASSWORD_MIN_LENGTH } from '../constants';

import { AddUserModal } from './add-user-modal';

vi.mock('antd', async (importOriginal) =>
  (await import('../../__tests__/test-utils')).withMockedAntdMessage(importOriginal),
);

vi.mock('@/api', async () => (await import('../../__tests__/test-utils')).mockGrafanaUsersApi());

const grafana = vi.mocked(API.grafanaUsers);
const projectList = vi.mocked(API.project.list);
const listUsers = vi.mocked(API.access.listUsers);
const EMAIL = 'ann@example.com';
const USER_NAME = 'Ann Lee';
const PASSWORD = 'a-long-enough-password';
const ARIA_DISABLED_ATTRIBUTE = 'aria-disabled';
const ARIA_DISABLED_VALUE = { TRUE: 'true', FALSE: 'false' } as const;
const user = (): GrafanaUser => ({
  id: 5,
  email: EMAIL,
  name: USER_NAME,
  role: GRAFANA_ROLE.VIEWER,
  disabled: false,
  sso: false,
  protected: false,
  projects: [],
});
const project = (name: string): IProject => ({ name, description: '', blueprint: null, metrics: [] });
const devlakeUser: AccessUser = {
  id: 1,
  issuer: 'test',
  subject: 'dev-ann',
  email: 'dev@example.com',
  displayName: 'Dev Ann',
  role: ACCESS_ROLE.MEMBER,
  status: ACCESS_STATUS.ACTIVE,
  hasLocalCredential: false,
};

const setup = () => {
  const props = { onClose: vi.fn(), onChanged: vi.fn(), onPassword: vi.fn() };
  renderWithTheme(<AddUserModal open {...props} />);
  return props;
};

const submit = (label: string) => screen.getByRole('button', { name: new RegExp(`${label}$`) });
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });
const fillAdd = (overrides: { email?: string; name?: string; password?: string } = {}) => {
  type(COPY.add.email.label, overrides.email ?? EMAIL);
  type(COPY.add.name.label, overrides.name ?? USER_NAME);
  type(COPY.password.label, overrides.password ?? PASSWORD);
};

beforeEach(() => {
  vi.resetAllMocks();
  projectList.mockResolvedValue({ projects: [project('alpha'), project('beta')], count: 2 });
  listUsers.mockResolvedValue({ users: [], count: 0, page: 1, pageSize: 25 });
  grafana.createUser.mockResolvedValue(user());
  grafana.updateUser.mockResolvedValue(user());
  grafana.setProjects.mockResolvedValue(user());
});

afterEach(() => {
  vi.mocked(message.success).mockClear();
  vi.mocked(message.error).mockClear();
  vi.restoreAllMocks();
});

describe('AddUserModal', () => {
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

  it('keeps its values after a failed create and succeeds on retry', async () => {
    grafana.createUser.mockRejectedValueOnce({
      response: { status: 409, data: { code: GRAFANA_ERROR_CODE.USER_EXISTS } },
    });
    const props = setup();
    fillAdd();
    fireEvent.click(submit(COPY.add.submit));
    await waitFor(() => expect(message.error).toHaveBeenCalledWith(GRAFANA_ERROR_MAP[GRAFANA_ERROR_CODE.USER_EXISTS]));
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onPassword).not.toHaveBeenCalled();
    expect((screen.getByLabelText(new RegExp(`^${COPY.add.email.label}`)) as HTMLInputElement).value).toBe(EMAIL);
    expect((screen.getByLabelText(new RegExp(`^${COPY.password.label}`)) as HTMLInputElement).value).toBe(PASSWORD);

    fireEvent.click(submit(COPY.add.submit));
    await waitFor(() => expect(props.onPassword).toHaveBeenCalledTimes(1));
    expect(grafana.createUser).toHaveBeenCalledTimes(2);
  });

  it.each([GRAFANA_ROLE.EDITOR, GRAFANA_ROLE.VIEWER])(
    'retries missing calls after a partial %s create',
    async (role) => {
      grafana.createUser.mockRejectedValueOnce({
        response: { status: 500, data: { code: GRAFANA_ERROR_CODE.PARTIAL, userId: 9 } },
      });
      const props = setup();
      fillAdd();
      if (role !== GRAFANA_ROLE.VIEWER) {
        fireEvent.mouseDown(screen.getByRole('combobox', { name: new RegExp(COPY.add.role.label) }));
        fireEvent.click(await screen.findByTitle(role));
      }
      fireEvent.click(submit(COPY.add.submit));
      expect(await screen.findByText(COPY.add.partial)).toBeTruthy();
      expect(props.onChanged).toHaveBeenCalledTimes(1);
      expect(props.onClose).not.toHaveBeenCalled();

      fireEvent.click(submit(COPY.add.retry));
      await waitFor(() => expect(props.onPassword).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD }));
      expect(grafana.createUser).toHaveBeenCalledTimes(1);
      if (role === GRAFANA_ROLE.VIEWER) expect(grafana.updateUser).not.toHaveBeenCalled();
      else expect(grafana.updateUser).toHaveBeenCalledWith(9, { role });
      expect(grafana.setProjects).not.toHaveBeenCalled();
    },
  );

  it('retries the selected role and projects after a partial create', async () => {
    grafana.createUser.mockRejectedValueOnce({
      response: { status: 502, data: { code: GRAFANA_ERROR_CODE.PARTIAL, userId: 9 } },
    });
    const props = setup();
    fillAdd();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: new RegExp(COPY.add.role.label) }));
    fireEvent.click(await screen.findByTitle(GRAFANA_ROLE.EDITOR));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: COPY.projects.label }));
    fireEvent.click(await screen.findByTitle('alpha'));

    fireEvent.click(submit(COPY.add.submit));
    expect(await screen.findByText(COPY.add.partial)).toBeTruthy();
    expect(grafana.createUser).toHaveBeenCalledWith({
      email: EMAIL,
      name: USER_NAME,
      role: GRAFANA_ROLE.EDITOR,
      projectNames: ['alpha'],
      password: PASSWORD,
    });

    fireEvent.click(submit(COPY.add.retry));
    await waitFor(() => expect(props.onPassword).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD }));
    expect(grafana.updateUser).toHaveBeenCalledWith(9, { role: GRAFANA_ROLE.EDITOR });
    expect(grafana.setProjects).toHaveBeenCalledWith(9, ['alpha']);
    expect(grafana.createUser).toHaveBeenCalledTimes(1);
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
