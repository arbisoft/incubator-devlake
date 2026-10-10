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
import { vi } from 'vitest';

import API from '@/api';
import { ACCESS_ROLE, ACCESS_STATUS, type AccessUser } from '@/api/access';
import { GRAFANA_ROLE } from '@/api/grafana-users/constants';
import type { GrafanaUser } from '@/api/grafana-users/types';
import type { IProject } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY, PASSWORD_MIN_LENGTH } from '../../constants';
import { AddUserModal } from '../add-user-modal';

export const grafana = vi.mocked(API.grafanaUsers);
export const projectList = vi.mocked(API.project.list);
export const listUsers = vi.mocked(API.access.listUsers);
export const EMAIL = 'ann@example.com';
export const USER_NAME = 'Ann Lee';
export const PASSWORD = 'x'.repeat(PASSWORD_MIN_LENGTH);
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

export const grafanaPage = (users: GrafanaUser[], count = users.length, page = 1) => ({
  users,
  count,
  page,
  pageSize: 100,
  orphans: [],
});

export const managedUser = (id: ID, role: GrafanaUser['role'], projects: string[]): GrafanaUser => ({
  ...user(),
  id,
  role,
  projects,
});

const project = (name: string): IProject => ({ name, description: '', blueprint: null, metrics: [] });

export const devlakeUser: AccessUser = {
  id: 1,
  issuer: 'test',
  subject: 'dev-ann',
  email: 'dev@example.com',
  displayName: 'Dev Ann',
  role: ACCESS_ROLE.MEMBER,
  status: ACCESS_STATUS.ACTIVE,
  hasLocalCredential: false,
};

export const setup = () => {
  const props = { onClose: vi.fn(), onChanged: vi.fn(), onPassword: vi.fn() };
  renderWithTheme(<AddUserModal open {...props} />);
  return props;
};

export const submit = (label: string) => screen.getByRole('button', { name: new RegExp(`${label}$`) });

export const clickProjectOption = async (name: string) => {
  let option: HTMLElement | undefined;
  await waitFor(() => {
    option = screen.queryAllByTitle(name).find((element) => element.classList.contains('ant-select-item-option'));
    if (!option) throw new Error(`Project option ${name} is not available`);
  });
  if (!option) throw new Error(`Project option ${name} is not available`);
  fireEvent.click(option);
};

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });

export const fillAdd = (overrides: { email?: string; name?: string; password?: string } = {}) => {
  type(COPY.add.email.label, overrides.email ?? EMAIL);
  type(COPY.add.name.label, overrides.name ?? USER_NAME);
  type(COPY.password.label, overrides.password ?? PASSWORD);
};

export const resetAddUserMocks = () => {
  vi.resetAllMocks();
  projectList.mockResolvedValue({ projects: [project('alpha'), project('beta')], count: 2 });
  grafana.listUsers.mockResolvedValue(grafanaPage([]));
  listUsers.mockResolvedValue({ users: [], count: 0, page: 1, pageSize: 25 });
  grafana.createUser.mockResolvedValue(user());
  grafana.updateUser.mockResolvedValue(user());
  grafana.setProjects.mockResolvedValue(user());
};

export const cleanupAddUserMocks = () => {
  vi.mocked(message.success).mockClear();
  vi.mocked(message.error).mockClear();
  vi.restoreAllMocks();
};

export const disabledAttribute = ARIA_DISABLED_ATTRIBUTE;
export const disabledValue = ARIA_DISABLED_VALUE;
