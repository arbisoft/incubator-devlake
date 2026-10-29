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
import { message } from 'antd';
import { HttpStatusCode } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { OTEL_STATUS, type OtelConnectionResponse } from '@/api/otel';
import { getOtelProjectError } from '@/routes/otel/utils';
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
  (await import('@/ui/__tests__/mock-message')).loadMockedMessage(importOriginal),
);

vi.mock('@/api', () => ({
  default: {
    project: { update: vi.fn(), remove: vi.fn() },
    otel: { listForProject: vi.fn(), validateProjectRemoval: vi.fn() },
    complianceScorecard: { list: vi.fn() },
  },
}));

const project = vi.mocked(API.project);
const otel = vi.mocked(API.otel);
const scorecard = vi.mocked(API.complianceScorecard);

const PROJECT: IProject = {
  name: 'Arbisoft Website',
  description: 'Project details',
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

const conflictError = (serverMessage: string) =>
  Object.assign(new Error('Conflict'), {
    isAxiosError: true as const,
    response: { status: HttpStatusCode.Conflict, data: { message: serverMessage } },
  });

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

const attemptRemovalWithConflict = async (serverMessage: string) => {
  project.remove.mockRejectedValueOnce(conflictError(serverMessage));
  setup([]);
  const dialog = await openDelete();
  fireEvent.click(within(dialog).getByRole('button', { name: COPY.settings.delete.confirm }));
  return dialog;
};

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    project.update.mockReset().mockResolvedValue({});
    project.remove.mockReset().mockResolvedValue({});
    otel.listForProject.mockReset();
    otel.validateProjectRemoval.mockReset().mockResolvedValue(undefined);
    scorecard.list.mockReset().mockResolvedValue({ count: 0, rows: [] });
  });

  it('saves a renamed project and moves to the new name, which loads it afresh', async () => {
    const { onRefresh } = setup();
    fireEvent.change(await screen.findByRole('textbox', { name: COPY.settings.name.label }), {
      target: { value: 'Renamed' },
    });
    fireEvent.click(screen.getByRole('button', { name: COPY.settings.save }));
    await waitFor(() => expect(project.update).toHaveBeenCalledOnce());
    expect(project.update.mock.calls[0][0]).toBe(PROJECT.name);
    expect(project.update.mock.calls[0][1]).toMatchObject({ name: 'Renamed', description: PROJECT.description });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/projects/Renamed/settings'));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('enables Save only while the form differs from the saved project', async () => {
    setup();
    const save = await screen.findByRole<HTMLButtonElement>('button', { name: COPY.settings.save });
    expect(save.disabled).toBe(true);
    const name = screen.getByRole('textbox', { name: COPY.settings.name.label });
    fireEvent.change(name, { target: { value: 'Other' } });
    expect(save.disabled).toBe(false);
    fireEvent.change(name, { target: { value: PROJECT.name } });
    expect(save.disabled).toBe(true);
  });

  it('refreshes in place when the name did not change', async () => {
    const { onRefresh } = setup();
    fireEvent.click(await screen.findByRole('checkbox', { name: COPY.settings.issueTrace.label }));
    fireEvent.click(screen.getByRole('button', { name: COPY.settings.save }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce());
    expect(project.update.mock.calls[0][1]).toMatchObject({ description: PROJECT.description });
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
    expect(message.success).toHaveBeenCalledOnce();
    expect(message.success).toHaveBeenCalledWith(COPY.settings.delete.success);
  });

  it('keeps the project when the removal check fails', async () => {
    const validationError = new Error('blocked');
    otel.validateProjectRemoval.mockRejectedValue(validationError);
    setup([placement(2)]);
    const dialog = await openDelete();
    fireEvent.click(within(dialog).getByRole('button', { name: COPY.settings.delete.confirm }));
    await waitFor(() => expect(otel.validateProjectRemoval).toHaveBeenCalled());
    expect(project.remove).not.toHaveBeenCalled();
    expect(message.error).toHaveBeenCalledWith(getOtelProjectError(validationError));
  });

  it('blocks deletion after a placement query error until retry returns a valid result', async () => {
    otel.listForProject.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    setup();

    expect(
      await screen.findByText('OpenTelemetry placements could not be checked. Retry before deleting this project.'),
    ).toBeTruthy();
    const remove = screen.getByRole<HTMLButtonElement>('button', { name: COPY.settings.delete.open });
    expect(remove.disabled).toBe(true);
    const name = screen.getByRole<HTMLInputElement>('textbox', { name: COPY.settings.name.label });
    fireEvent.change(name, { target: { value: 'Unsaved project name' } });
    fireEvent.click(screen.getByRole('button', { name: COMMON_COPY.retry }));

    await waitFor(() => expect(otel.listForProject).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(remove.disabled).toBe(false));
    expect(name.value).toBe('Unsaved project name');
  });

  it('maps a racing final OTel placement conflict and retries removal without extra checks', async () => {
    const marker = 'revoke the active Claude Code OTel connection before deleting its final project placement';
    const dialog = await attemptRemovalWithConflict(marker);
    await waitFor(() => expect(message.error).toHaveBeenCalledWith(COPY.settings.delete.otelFinalActive));
    expect(project.remove).toHaveBeenCalledOnce();
    expect(otel.validateProjectRemoval).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: COPY.settings.delete.title(PROJECT.name) })).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();

    project.remove.mockResolvedValueOnce({});
    const confirm = within(dialog).getByRole('button', { name: /Delete project/ });
    await waitFor(() => expect(confirm.classList.contains('ant-btn-loading')).toBe(false));
    fireEvent.click(confirm);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/projects'));
    expect(message.success).toHaveBeenCalledOnce();
    expect(message.success).toHaveBeenCalledWith(COPY.settings.delete.success);
    expect(otel.listForProject).toHaveBeenCalledOnce();
  });

  it('keeps the unfinished pipeline copy for an ordinary delete conflict', async () => {
    await attemptRemovalWithConflict('pipeline running');
    await waitFor(() => expect(message.error).toHaveBeenCalledWith(COPY.settings.delete.unfinishedPipelines));
    expect(project.remove).toHaveBeenCalledOnce();
    expect(otel.validateProjectRemoval).not.toHaveBeenCalled();
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
