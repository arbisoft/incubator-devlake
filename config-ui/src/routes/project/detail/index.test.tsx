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
import { HttpStatusCode } from 'axios';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { PATHS, PROJECT_TAB } from '@/config';
import type { IProject } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import { COMMON_COPY } from '@/ui/constants';

import { COPY } from './constants';
import type { ProjectPanelProps } from './types';

import { ProjectDetailPage } from './index';

const LOAD_FAILED = 'The project could not be loaded.';
const PROJECT_CONTENT_TEST_ID = 'project-content';
const SETTINGS_DRAFT_LABEL = 'settings draft';

vi.mock('antd', async (importOriginal) =>
  (await import('@/ui/__tests__/mock-message')).loadMockedMessage(importOriginal),
);

vi.mock('@/api', () => ({ default: { project: { get: vi.fn() } } }));

vi.mock('@/routes', () => ({
  BLUEPRINT_CONTEXT: { PROJECT: 'project' },
  BlueprintDetail: () => null,
  getProjectBlueprintViews: () => [],
  useBlueprintView: () => 'status',
}));

vi.mock('./settings-panel', () => ({
  SettingsPanel: ({ project, onRefresh }: ProjectPanelProps) => (
    <section data-testid={PROJECT_CONTENT_TEST_ID}>
      <span>{project.name}</span>
      <input aria-label={SETTINGS_DRAFT_LABEL} defaultValue="saved" />
      <button onClick={onRefresh}>Refresh project</button>
    </section>
  ),
}));

vi.mock('./webhooks-panel', () => ({ WebhooksPanel: () => null }));
vi.mock('./claude-code-otel-panel', () => ({ ClaudeCodeOtelPanel: () => null }));

const projectApi = vi.mocked(API.project);

const PROJECT: IProject = {
  name: 'Project Alpha',
  description: '',
  blueprint: null,
  metrics: [],
};
const NEXT_PROJECT: IProject = { ...PROJECT, name: 'Project Beta' };

const CurrentPath = () => <output aria-label="current path">{useLocation().pathname}</output>;

const ChangeProject = () => {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(PATHS.PROJECT_TAB(NEXT_PROJECT.name, PROJECT_TAB.SETTINGS))}>Change project</button>
  );
};

const renderPage = (path = PATHS.PROJECT_TAB(PROJECT.name, PROJECT_TAB.SETTINGS)) =>
  renderWithTheme(
    <MemoryRouter initialEntries={[path]}>
      <CurrentPath />
      <ChangeProject />
      <Routes>
        <Route path="/projects/:pname/:tab" element={<ProjectDetailPage />} />
        <Route path="/projects" element={<span>Projects list</span>} />
      </Routes>
    </MemoryRouter>,
  );

describe('ProjectDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an initial load error and retries the same project', async () => {
    projectApi.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(PROJECT);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: COMMON_COPY.retry }));

    expect(await screen.findByTestId(PROJECT_CONTENT_TEST_ID)).toBeTruthy();
    expect(projectApi.get).toHaveBeenCalledTimes(2);
    expect(projectApi.get).toHaveBeenLastCalledWith(PROJECT.name, expect.any(AbortSignal));
  });

  it('keeps the active settings content and draft after a refresh failure', async () => {
    projectApi.get.mockResolvedValueOnce(PROJECT).mockRejectedValueOnce(new Error('offline'));
    renderPage();

    const draft = await screen.findByRole<HTMLInputElement>('textbox', { name: SETTINGS_DRAFT_LABEL });
    fireEvent.change(draft, { target: { value: 'unsaved settings' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh project' }));

    expect(await screen.findByText(LOAD_FAILED)).toBeTruthy();
    expect(screen.getByTestId(PROJECT_CONTENT_TEST_ID)).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: SETTINGS_DRAFT_LABEL }).value).toBe(
      'unsaved settings',
    );
  });

  it('does not show the previous project while the next project loads', async () => {
    let resolveNext: ((project: IProject) => void) | undefined;
    projectApi.get.mockResolvedValueOnce({ ...PROJECT, name: 'Project Alpha' }).mockImplementationOnce(
      () =>
        new Promise<IProject>((resolve) => {
          resolveNext = resolve;
        }),
    );
    renderPage();
    expect((await screen.findByTestId(PROJECT_CONTENT_TEST_ID)).textContent).toContain(PROJECT.name);

    fireEvent.click(screen.getByRole('button', { name: 'Change project' }));
    await waitFor(() => expect(projectApi.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId(PROJECT_CONTENT_TEST_ID)).toBeNull();

    if (!resolveNext) throw new Error('The next project request did not start.');
    resolveNext(NEXT_PROJECT);
    expect((await screen.findByTestId(PROJECT_CONTENT_TEST_ID)).textContent).toContain(NEXT_PROJECT.name);
  });

  it('keeps the 404 toast and delayed return to the project list', async () => {
    const notFound = Object.assign(new Error('missing'), {
      isAxiosError: true,
      response: { status: HttpStatusCode.NotFound },
    });
    projectApi.get.mockRejectedValueOnce(notFound);
    renderPage();

    await waitFor(() => expect(projectApi.get).toHaveBeenCalledOnce());
    expect(await screen.findByText('Projects list')).toBeTruthy();
    expect(screen.getByLabelText('current path').textContent).toBe(PATHS.PROJECTS());
    expect(message.error).toHaveBeenCalledWith(COPY.notFound(PROJECT.name));
  });
});
