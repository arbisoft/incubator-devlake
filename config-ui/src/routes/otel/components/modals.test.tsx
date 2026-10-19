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

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import type { OtelConnectionResponse } from '@/api/otel';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY as OTEL_COPY } from '../constants';
import { getReplayDateLimits } from '../utils';

import { connection, isDisabled, silenceFeedback } from './__tests__/modal-test-utils';
import { COPY } from './constants';
import { CreateModal } from './create-modal';
import { ProjectsModal } from './projects-modal';
import { ReplayModal } from './replay-modal';

vi.mock('@/api', () => ({
  default: { otel: { create: vi.fn(), updateProjects: vi.fn(), rebind: vi.fn(), createReplay: vi.fn() } },
}));

const otel = vi.mocked(API.otel);

const LOADING_CLASS = 'ant-btn-loading';
const PROJECT_ALPHA = 'Project Alpha';
const PROJECT_BETA = 'Project Beta';
const projectOptions = [{ name: PROJECT_ALPHA }, { name: PROJECT_BETA }];

describe('OTel modals', () => {
  beforeEach(silenceFeedback);
  afterEach(() => vi.restoreAllMocks());

  it('keeps create values and the modal open after failure so the user can retry', async () => {
    const created = connection();
    const onCreated = vi.fn();
    const createError = { response: { status: 400, data: { message: '/private/create-internal' } } };
    let rejectCreate!: (reason: unknown) => void;
    const pendingCreate = new Promise<OtelConnectionResponse>((_resolve, reject) => {
      rejectCreate = reject;
    });
    otel.create.mockReturnValueOnce(pendingCreate);
    otel.create.mockResolvedValueOnce(created);
    renderWithTheme(
      <CreateModal
        open
        presetProject={PROJECT_ALPHA}
        projectOptions={projectOptions}
        onClose={vi.fn()}
        onCreated={onCreated}
      />,
    );

    try {
      const teamName = await screen.findByRole('textbox', { name: COPY.create.teamName.label });
      fireEvent.change(teamName, { target: { value: '  Platform  ' } });
      await waitFor(() => expect(screen.getByText(PROJECT_ALPHA)).toBeTruthy());
      const submit = screen.getByRole('button', { name: COPY.create.submit });

      fireEvent.click(submit);
      await waitFor(() => expect(submit.classList.contains(LOADING_CLASS)).toBe(true));
      rejectCreate(createError);
      await waitFor(() => expect(message.error).toHaveBeenCalledWith(OTEL_COPY.errors.createValidation));
      expect(screen.getByRole('dialog', { name: COPY.create.title })).toBeTruthy();
      expect(teamName).toHaveProperty('value', '  Platform  ');
      expect(screen.getByText(PROJECT_ALPHA)).toBeTruthy();
      expect(otel.create).toHaveBeenNthCalledWith(1, { teamName: 'Platform', projectNames: [PROJECT_ALPHA] });
      await waitFor(() => expect(submit.classList.contains(LOADING_CLASS)).toBe(false));

      fireEvent.click(submit);
      await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
      expect(otel.create).toHaveBeenNthCalledWith(2, { teamName: 'Platform', projectNames: [PROJECT_ALPHA] });
      expect(otel.create).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => {
        rejectCreate(createError);
        await pendingCreate.catch(() => undefined);
      });
    }
  });

  it('keeps project placement open and selected after failure so Save can be retried', async () => {
    const saved = vi.fn();
    const projectError = { response: { status: 409, data: { message: '/private/projects-internal' } } };
    let rejectProjects!: (reason: unknown) => void;
    const pendingProjects = new Promise<{ name: string }[]>((_resolve, reject) => {
      rejectProjects = reject;
    });
    otel.updateProjects.mockReturnValueOnce(pendingProjects);
    otel.updateProjects.mockResolvedValueOnce(projectOptions);
    renderWithTheme(
      <ProjectsModal
        open
        connection={connection()}
        projectOptions={projectOptions}
        onClose={vi.fn()}
        onSaved={saved}
      />,
    );

    try {
      const save = await screen.findByRole('button', { name: COPY.projectsModal.submit });
      await waitFor(() => expect(screen.getByText(PROJECT_ALPHA)).toBeTruthy());
      fireEvent.click(save);
      await waitFor(() => expect(save.classList.contains(LOADING_CLASS)).toBe(true));
      rejectProjects(projectError);
      await waitFor(() => expect(message.error).toHaveBeenCalledWith(OTEL_COPY.errors.projects));
      expect(screen.getByRole('dialog', { name: COPY.projectsModal.title })).toBeTruthy();
      expect(screen.getByText(PROJECT_ALPHA)).toBeTruthy();
      await waitFor(() => expect(save.classList.contains(LOADING_CLASS)).toBe(false));

      fireEvent.click(save);
      await waitFor(() => expect(saved).toHaveBeenCalledOnce());
      expect(otel.updateProjects).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => {
        rejectProjects(projectError);
        await pendingProjects.catch(() => undefined);
      });
    }
  });

  describe('rebuild data', () => {
    const { min, max } = getReplayDateLimits(new Date());
    const pickDays = (start: string, end: string) => {
      const [from, to] = screen.getAllByPlaceholderText(/./).filter((input) => input.closest('.ant-picker'));
      fireEvent.mouseDown(from);
      fireEvent.change(from, { target: { value: start } });
      fireEvent.keyDown(from, { key: 'Enter', keyCode: 13 });
      fireEvent.change(to, { target: { value: end } });
      fireEvent.keyDown(to, { key: 'Enter', keyCode: 13 });
    };
    const getSubmit = () => screen.getByRole('button', { name: COPY.replayModal.submit });

    it('opens with no days picked, so Rebuild is disabled for the range hint', async () => {
      renderWithTheme(<ReplayModal open onClose={vi.fn()} onQueued={vi.fn()} />);

      expect(isDisabled(getSubmit())).toBe(true);
      fireEvent.click(getSubmit());
      expect(otel.createReplay).not.toHaveBeenCalled();
      fireEvent.mouseEnter(getSubmit());
      expect((await screen.findByRole('tooltip')).textContent).toBe(COPY.range.hint(min, max));
    });

    it('rebuilds every team only after the picked days are confirmed and sends no connection', async () => {
      const onQueued = vi.fn();
      otel.createReplay.mockResolvedValueOnce({ queued: [], reused: [] });
      renderWithTheme(<ReplayModal open onClose={vi.fn()} onQueued={onQueued} />);

      pickDays(max, max);
      await waitFor(() => expect(isDisabled(getSubmit())).toBe(false));
      fireEvent.click(getSubmit());
      expect(otel.createReplay).not.toHaveBeenCalled();
      expect(await screen.findByText(COPY.replayModal.confirm.title())).toBeTruthy();
      fireEvent.click(screen.getAllByRole('button', { name: COPY.replayModal.confirm.confirm }).at(-1) as HTMLElement);

      await waitFor(() => expect(onQueued).toHaveBeenCalledOnce());
      expect(otel.createReplay).toHaveBeenCalledWith({ startDate: max, endDate: max });
      expect(otel.createReplay.mock.calls[0][0]).not.toHaveProperty('requestedForConnectionId');
    });
  });
});
