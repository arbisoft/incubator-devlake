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
import { OTEL_STATUS, type OtelConnectionResponse } from '@/api/otel';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY as OTEL_COPY } from '../constants';

import { COPY } from './constants';
import { CreateModal } from './create-modal';
import { ProjectsModal } from './projects-modal';

vi.mock('@/api', () => ({ default: { otel: { create: vi.fn(), updateProjects: vi.fn() } } }));

const otel = vi.mocked(API.otel);

const connection = (): OtelConnectionResponse => ({
  connection: {
    id: 7,
    name: 'claude-platform',
    teamName: 'Platform',
    teamSlug: 'platform',
    collectorEndpoint: 'https://collector.example.com',
    protocol: 'http',
    status: OTEL_STATUS.ACTIVE,
    organizationId: null,
    revokedAt: null,
    createdAt: '',
    updatedAt: '',
  },
  credentials: [],
  restartRequired: false,
  recoveryRequired: false,
  storageNeedsApplying: false,
  projects: [{ name: 'Project Alpha' }],
});

const LOADING_CLASS = 'ant-btn-loading';
const PROJECT_ALPHA = 'Project Alpha';
const PROJECT_BETA = 'Project Beta';
const projectOptions = [{ name: PROJECT_ALPHA }, { name: PROJECT_BETA }];

describe('OTel modals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    vi.spyOn(message, 'warning').mockImplementation(() => undefined as never);
    vi.spyOn(message, 'info').mockImplementation(() => undefined as never);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps create values and the modal open after failure so the user can retry', async () => {
    const created = connection();
    const onCreated = vi.fn();
    const createError = { response: { status: 400, data: { message: '/private/create-internal' } } };
    let rejectCreate!: (reason: unknown) => void;
    otel.create.mockImplementationOnce(
      () => new Promise<OtelConnectionResponse>((_resolve, reject) => (rejectCreate = reject)),
    );
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

    const teamName = await screen.findByRole('textbox', { name: COPY.create.teamName.label });
    fireEvent.change(teamName, { target: { value: 'Platform' } });
    await waitFor(() => expect(screen.getByText(PROJECT_ALPHA)).toBeTruthy());
    const submit = screen.getByRole('button', { name: COPY.create.submit });

    fireEvent.click(submit);
    await waitFor(() => expect(submit.classList.contains(LOADING_CLASS)).toBe(true));
    rejectCreate(createError);
    await waitFor(() => expect(message.error).toHaveBeenCalledWith(OTEL_COPY.errors.createValidation));
    expect(screen.getByRole('dialog', { name: COPY.create.title })).toBeTruthy();
    expect(teamName).toHaveProperty('value', 'Platform');
    expect(screen.getByText(PROJECT_ALPHA)).toBeTruthy();
    await waitFor(() => expect(submit.classList.contains(LOADING_CLASS)).toBe(false));

    fireEvent.click(submit);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(otel.create).toHaveBeenCalledTimes(2);
  });

  it('keeps project placement open and selected after failure so Save can be retried', async () => {
    const saved = vi.fn();
    const projectError = { response: { status: 409, data: { message: '/private/projects-internal' } } };
    let rejectProjects!: (reason: unknown) => void;
    otel.updateProjects.mockImplementationOnce(
      () => new Promise<{ name: string }[]>((_resolve, reject) => (rejectProjects = reject)),
    );
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
  });
});
