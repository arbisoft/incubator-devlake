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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GRAFANA_ERROR_CODE, GRAFANA_ROLE } from '@/api/grafana-users/constants';
import type { GrafanaRole } from '@/api/grafana-users/types';

import { COPY } from '../../constants';

import {
  cleanupAddUserMocks,
  clickProjectOption,
  EMAIL,
  fillAdd,
  grafana,
  grafanaPage,
  managedUser,
  PASSWORD,
  resetAddUserMocks,
  setup,
  submit,
  USER_NAME,
} from './add-user-modal-helpers';

const selectRole = async (role: GrafanaRole) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: new RegExp(COPY.add.role.label) }));
  fireEvent.click(await screen.findByTitle(role));
};

const selectProjects = async (projects: string[]) => {
  if (projects.length === 0) return;
  fireEvent.mouseDown(screen.getByRole('combobox', { name: COPY.projects.label }));
  for (const project of projects) await clickProjectOption(project);
};

const toggleProject = async (project: string) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: COPY.projects.label }));
  await clickProjectOption(project);
};

const createPartial = async ({
  role = GRAFANA_ROLE.VIEWER,
  projects = [],
}: { role?: GrafanaRole; projects?: string[] } = {}) => {
  grafana.createUser.mockRejectedValueOnce({
    response: { status: 502, data: { code: GRAFANA_ERROR_CODE.PARTIAL, userId: 9 } },
  });
  const props = setup();
  fillAdd();
  if (role !== GRAFANA_ROLE.VIEWER) await selectRole(role);
  await selectProjects(projects);
  fireEvent.click(submit(COPY.add.submit));
  expect(await screen.findByText(COPY.add.partial)).toBeTruthy();
  return props;
};

const retrySuccessfully = async (props: ReturnType<typeof setup>) => {
  fireEvent.click(submit(COPY.add.retry));
  await waitFor(() => expect(props.onPassword).toHaveBeenCalledTimes(1));
};

describe('AddUserModal partial retry', () => {
  beforeEach(resetAddUserMocks);
  afterEach(cleanupAddUserMocks);

  it.each([GRAFANA_ROLE.EDITOR, GRAFANA_ROLE.VIEWER])(
    'writes both desired values when the user is not in the org (%s)',
    async (role) => {
      const props = await createPartial({ role });
      await retrySuccessfully(props);
      expect(props.onPassword).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD });
      expect(grafana.createUser).toHaveBeenCalledTimes(1);
      expect(grafana.updateUser).toHaveBeenCalledWith(9, { role });
      expect(grafana.setProjects).toHaveBeenCalledWith(9, []);
    },
  );

  it('retries the selected role and project with the original create payload', async () => {
    const props = await createPartial({ role: GRAFANA_ROLE.EDITOR, projects: ['alpha'] });
    expect(grafana.createUser).toHaveBeenCalledWith({
      email: EMAIL,
      name: USER_NAME,
      role: GRAFANA_ROLE.EDITOR,
      projectNames: ['alpha'],
      password: PASSWORD,
    });

    await retrySuccessfully(props);
    expect(props.onPassword).toHaveBeenCalledWith({ email: EMAIL, password: PASSWORD });
    expect(grafana.updateUser).toHaveBeenCalledWith(9, { role: GRAFANA_ROLE.EDITOR });
    expect(grafana.setProjects).toHaveBeenCalledWith(9, ['alpha']);
    expect(grafana.createUser).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: 'default Viewer and empty projects',
      desiredRole: GRAFANA_ROLE.VIEWER,
      desiredProjects: [],
      currentRole: GRAFANA_ROLE.VIEWER,
      currentProjects: [],
      writesRole: false,
      writesProjects: false,
    },
    {
      label: 'Editor and the same projects in a different order',
      desiredRole: GRAFANA_ROLE.EDITOR,
      desiredProjects: ['alpha', 'beta'],
      currentRole: GRAFANA_ROLE.EDITOR,
      currentProjects: ['beta', 'alpha'],
      writesRole: false,
      writesProjects: false,
    },
    {
      label: 'role only',
      currentRole: GRAFANA_ROLE.VIEWER,
      currentProjects: ['alpha'],
      desiredRole: GRAFANA_ROLE.EDITOR,
      desiredProjects: ['alpha'],
      writesRole: true,
      writesProjects: false,
    },
    {
      label: 'projects only',
      currentRole: GRAFANA_ROLE.EDITOR,
      currentProjects: [],
      desiredRole: GRAFANA_ROLE.EDITOR,
      desiredProjects: ['alpha'],
      writesRole: false,
      writesProjects: true,
    },
  ])(
    'reconciles only differing fields for $label',
    async ({ currentRole, currentProjects, desiredRole, desiredProjects, writesRole, writesProjects }) => {
      const props = await createPartial({ role: desiredRole, projects: desiredProjects });
      grafana.listUsers.mockResolvedValueOnce(grafanaPage([managedUser(9, currentRole, currentProjects)]));

      await retrySuccessfully(props);
      if (writesRole) expect(grafana.updateUser).toHaveBeenCalledWith(9, { role: desiredRole });
      else expect(grafana.updateUser).not.toHaveBeenCalled();
      if (writesProjects) expect(grafana.setProjects).toHaveBeenCalledWith(9, desiredProjects);
      else expect(grafana.setProjects).not.toHaveBeenCalled();
      expect(grafana.listUsers).toHaveBeenCalledWith({ query: EMAIL, page: 1, pageSize: 100 });
    },
  );

  it.each([100, 101])('finds the exact user on page two when the filtered count is %i', async (count) => {
    const props = await createPartial();
    const firstPageSize = count === 100 ? 99 : 100;
    const firstPageUsers = Array.from({ length: firstPageSize }, (_, index) => ({
      ...managedUser(20 + index, GRAFANA_ROLE.VIEWER, []),
      email: `ann${index}@example.com`,
    }));
    grafana.listUsers
      .mockResolvedValueOnce(grafanaPage(firstPageUsers, count))
      .mockResolvedValueOnce(grafanaPage([managedUser('9', GRAFANA_ROLE.VIEWER, [])], count, 2));

    await retrySuccessfully(props);
    expect(grafana.listUsers).toHaveBeenNthCalledWith(1, { query: EMAIL, page: 1, pageSize: 100 });
    expect(grafana.listUsers).toHaveBeenNthCalledWith(2, { query: EMAIL, page: 2, pageSize: 100 });
    expect(grafana.updateUser).not.toHaveBeenCalled();
    expect(grafana.setProjects).not.toHaveBeenCalled();
  });

  it('reconciles a changed role and empty project set before the first retry', async () => {
    const props = await createPartial({ role: GRAFANA_ROLE.EDITOR, projects: ['alpha'] });
    await selectRole(GRAFANA_ROLE.VIEWER);
    await toggleProject('alpha');
    grafana.listUsers.mockResolvedValueOnce(grafanaPage([managedUser(9, GRAFANA_ROLE.EDITOR, ['alpha'])]));

    await retrySuccessfully(props);
    expect(grafana.createUser).toHaveBeenCalledTimes(1);
    expect(grafana.updateUser).toHaveBeenCalledWith(9, { role: GRAFANA_ROLE.VIEWER });
    expect(grafana.setProjects).toHaveBeenCalledWith(9, []);
  });

  it('reconciles edits after a successful role write and failed project write', async () => {
    const props = await createPartial({ role: GRAFANA_ROLE.EDITOR, projects: ['alpha'] });
    grafana.listUsers
      .mockResolvedValueOnce(grafanaPage([]))
      .mockResolvedValueOnce(grafanaPage([managedUser(9, GRAFANA_ROLE.EDITOR, ['alpha'])]));
    grafana.setProjects.mockRejectedValueOnce(new Error('project update failed'));

    fireEvent.click(submit(COPY.add.retry));
    await waitFor(() => expect(message.error).toHaveBeenCalled());
    expect(grafana.updateUser).toHaveBeenCalledWith(9, { role: GRAFANA_ROLE.EDITOR });
    expect(grafana.setProjects).toHaveBeenCalledWith(9, ['alpha']);
    expect(props.onPassword).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();

    await selectRole(GRAFANA_ROLE.VIEWER);
    await toggleProject('alpha');
    await retrySuccessfully(props);
    expect(grafana.createUser).toHaveBeenCalledTimes(1);
    expect(grafana.updateUser).toHaveBeenNthCalledWith(2, 9, { role: GRAFANA_ROLE.VIEWER });
    expect(grafana.setProjects).toHaveBeenNthCalledWith(2, 9, []);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the retry open and performs no writes when the lookup fails', async () => {
    const props = await createPartial();
    grafana.listUsers.mockRejectedValueOnce(new Error('lookup failed'));

    fireEvent.click(submit(COPY.add.retry));
    await waitFor(() => expect(message.error).toHaveBeenCalled());
    expect(screen.getByText(COPY.add.partial)).toBeTruthy();
    expect(submit(COPY.add.retry)).toBeTruthy();
    expect(grafana.updateUser).not.toHaveBeenCalled();
    expect(grafana.setProjects).not.toHaveBeenCalled();
    expect(grafana.createUser).toHaveBeenCalledTimes(1);
    expect(props.onPassword).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
