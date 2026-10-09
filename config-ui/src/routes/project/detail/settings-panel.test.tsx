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

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { OTEL_STATUS, type OtelConnectionResponse } from '@/api/otel';
import { IBPMode, type IProject } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import { COMMON_COPY } from '@/ui/constants';

import { COPY } from './constants';
import { SettingsPanel } from './settings-panel';

const navigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

vi.mock('antd', async (importOriginal) =>
  (await import('@/ui/__tests__/antd-message-mock')).withMockedMessage(await importOriginal<typeof import('antd')>()),
);

vi.mock('@/api', () => ({
  default: {
    project: { update: vi.fn(), remove: vi.fn() },
    otel: { listForProject: vi.fn(), validateProjectRemoval: vi.fn() },
  },
}));

const project = vi.mocked(API.project);
const otel = vi.mocked(API.otel);

const PROJECT: IProject = {
  name: 'Arbisoft Website',
  description: '',
  metrics: [{ pluginName: 'dora', pluginOption: {}, enable: true }],
  blueprint: {
    id: 1,
    name: 'bp',
    projectName: 'Arbisoft Website',
    mode: IBPMode.NORMAL,
    enable: true,
    isManual: false,
    cronConfig: '0 0 * * *',
    skipOnFail: true,
    plan: null,
    timeAfter: null,
    connections: [],
  },
};

const placement = (projects: number) =>
  ({
    connection: { id: 1, teamName: 'Platform', status: OTEL_STATUS.ACTIVE },
    projects: Array.from({ length: projects }, (_, index) => ({ name: `p${index}` })),
  }) as OtelConnectionResponse;

const setup = (placements: OtelConnectionResponse[] = []) => {
  otel.listForProject.mockResolvedValue(placements);
  const onRefresh = vi.fn();
  renderWithTheme(
    <MemoryRouter>
      <SettingsPanel project={PROJECT} onRefresh={onRefresh} />
    </MemoryRouter>,
  );
  return { onRefresh };
};

const openDelete = async () => {
  const button = await screen.findByRole('button', { name: COPY.settings.delete.open });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
  return screen.findByRole('dialog', { name: COPY.settings.delete.title(PROJECT.name) });
};

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    project.update.mockResolvedValue({});
    project.remove.mockResolvedValue({});
    otel.validateProjectRemoval.mockResolvedValue(undefined);
  });

  it('saves a renamed project and moves to the new name, which loads it afresh', async () => {
    const { onRefresh } = setup();
    fireEvent.change(await screen.findByRole('textbox', { name: COPY.settings.name.label }), {
      target: { value: 'Renamed' },
    });
    fireEvent.click(screen.getByRole('button', { name: COPY.settings.save }));
    await waitFor(() => expect(project.update).toHaveBeenCalledOnce());
    expect(project.update.mock.calls[0][0]).toBe(PROJECT.name);
    expect(project.update.mock.calls[0][1]).toMatchObject({ name: 'Renamed', description: '' });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/projects/Renamed/settings'));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('refreshes in place when the name did not change', async () => {
    const { onRefresh } = setup();
    fireEvent.click(await screen.findByRole('button', { name: COPY.settings.save }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows the regex field only while the linker is on', async () => {
    setup();
    await screen.findByRole('checkbox', { name: COPY.settings.linker.label });
    expect(screen.queryByRole('textbox', { name: COPY.settings.linker.regexLabel })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: COPY.settings.linker.label }));
    expect(screen.getByRole('textbox', { name: COPY.settings.linker.regexLabel })).toBeTruthy();
  });

  it('restores the saved values on discard', async () => {
    setup();
    const name = await screen.findByRole<HTMLInputElement>('textbox', { name: COPY.settings.name.label });
    fireEvent.change(name, { target: { value: 'Other' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.settings.discard }));
    expect(name.value).toBe(PROJECT.name);
  });

  it('draws the trash icon on the delete button', async () => {
    setup();
    const button = await screen.findByRole('button', { name: COPY.settings.delete.open });
    expect(button.querySelector('.anticon-delete')).not.toBeNull();
  });

  it('deletes a project without placements after one confirmation', async () => {
    setup();
    const dialog = await openDelete();
    expect(dialog.textContent).toContain(COPY.settings.delete.description);
    fireEvent.click(within(dialog).getByRole('button', { name: COPY.settings.delete.confirm }));
    await waitFor(() => expect(project.remove).toHaveBeenCalledWith(PROJECT.name));
    expect(otel.validateProjectRemoval).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/projects');
  });

  it('checks the removal first when the project has placements, and says they are removed', async () => {
    setup([placement(2)]);
    const dialog = await openDelete();
    expect(dialog.textContent).toContain(COPY.settings.delete.otelRemoved);
    fireEvent.click(within(dialog).getByRole('button', { name: COPY.settings.delete.confirm }));
    await waitFor(() => expect(project.remove).toHaveBeenCalledWith(PROJECT.name));
    expect(otel.validateProjectRemoval).toHaveBeenCalledWith(PROJECT.name);
  });

  it('keeps the project when the removal check fails', async () => {
    otel.validateProjectRemoval.mockRejectedValue(new Error('blocked'));
    setup([placement(2)]);
    const dialog = await openDelete();
    fireEvent.click(within(dialog).getByRole('button', { name: COPY.settings.delete.confirm }));
    await waitFor(() => expect(otel.validateProjectRemoval).toHaveBeenCalled());
    expect(project.remove).not.toHaveBeenCalled();
  });

  it('blocks the delete while this project is the last placement of an active connection', async () => {
    setup([placement(1)]);
    const dialog = await openDelete();
    expect(dialog.textContent).toContain(COPY.settings.delete.otelFinalActive);
    expect(within(dialog).getByRole<HTMLButtonElement>('button', { name: COPY.settings.delete.confirm }).disabled).toBe(
      true,
    );
    expect(within(dialog).getByRole('button', { name: COMMON_COPY.cancel })).toBeTruthy();
  });
});
