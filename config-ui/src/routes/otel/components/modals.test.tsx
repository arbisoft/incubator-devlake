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
import dayjs from 'dayjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { OTEL_STATUS, type OtelConnection, type OtelConnectionResponse } from '@/api/otel';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY as OTEL_COPY } from '../constants';
import { REPLAY_COPY } from '../replay-constants';
import { getReplayDateLimits } from '../utils';

import { COPY } from './constants';
import { CreateModal } from './create-modal';
import { ProjectsModal } from './projects-modal';
import { RebindModal } from './rebind-modal';
import { ReplayModal } from './replay-modal';

vi.mock('@/api', () => ({
  default: { otel: { create: vi.fn(), updateProjects: vi.fn(), rebind: vi.fn(), createReplay: vi.fn() } },
}));

const otel = vi.mocked(API.otel);

const connection = (overrides: Partial<OtelConnection> = {}): OtelConnectionResponse => ({
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
    ...overrides,
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

  describe('change organization', () => {
    const CURRENT_ORG = '8f14e45f-ceea-4e0a-9f3a-0d2f9a1b2c3d';
    const NEXT_ORG = '1c2d3e4f-0000-4000-8000-000000000001';
    const boundConnection = (overrides: Partial<OtelConnection> = {}) =>
      connection({ organizationId: CURRENT_ORG, createdAt: '2020-01-01T00:00:00Z', ...overrides });

    const renderRebind = (target: OtelConnectionResponse = boundConnection()) => {
      const onRebound = vi.fn();
      renderWithTheme(<RebindModal open connection={target} onClose={vi.fn()} onRebound={onRebound} />);
      return onRebound;
    };
    const typeOrganization = (value: string) =>
      fireEvent.change(screen.getByRole('textbox', { name: COPY.rebind.field.label }), { target: { value } });
    const getContinue = () => screen.getByRole('button', { name: COPY.rebind.submit });
    const isBlocked = () => getContinue().getAttribute('aria-disabled') === 'true';
    const getConfirm = () => screen.findByRole('button', { name: COPY.rebind.confirm.confirm });
    const typeSlug = async (value: string) =>
      fireEvent.change(await screen.findByRole('textbox', { name: COPY.rebind.confirm.slug('platform') }), {
        target: { value },
      });
    const rebindThrough = async () => {
      typeOrganization(NEXT_ORG);
      fireEvent.click(getContinue());
      await typeSlug('platform');
      fireEvent.click(await getConfirm());
    };

    it('blocks continuing for an invalid or unchanged organization ID', () => {
      renderRebind();

      expect(isBlocked()).toBe(true);
      typeOrganization('not-a-uuid');
      expect(isBlocked()).toBe(true);
      typeOrganization(CURRENT_ORG.toUpperCase());
      expect(isBlocked()).toBe(true);
      typeOrganization(NEXT_ORG);
      expect(isBlocked()).toBe(false);
    });

    it('needs the typed team slug before confirming and keeps the values after a failure so it can be retried', async () => {
      const onRebound = renderRebind();
      otel.rebind.mockRejectedValueOnce({ response: { status: 400, data: { message: '/private/rebind-internal' } } });
      otel.rebind.mockResolvedValueOnce({ connection: boundConnection() });
      const { min, max } = getReplayDateLimits(new Date());
      typeOrganization(NEXT_ORG);
      fireEvent.click(getContinue());

      const confirm = await getConfirm();
      expect(confirm).toHaveProperty('disabled', true);
      await typeSlug('platform');
      expect(confirm).toHaveProperty('disabled', false);
      fireEvent.click(confirm);
      await waitFor(() => expect(message.error).toHaveBeenCalledWith(REPLAY_COPY.errors.rebind));
      expect(screen.getByRole('textbox', { name: COPY.rebind.field.label })).toHaveProperty('value', NEXT_ORG);
      expect(screen.getByText(COPY.rebind.confirm.title('Platform'))).toBeTruthy();

      await waitFor(() => expect(confirm).toHaveProperty('disabled', false));
      fireEvent.click(confirm);
      await waitFor(() => expect(onRebound).toHaveBeenCalledOnce());
      expect(otel.rebind).toHaveBeenNthCalledWith(1, 7, {
        organizationId: NEXT_ORG,
        replay: { startDate: min, endDate: max },
      });
      expect(otel.rebind).toHaveBeenCalledTimes(2);
      expect(message.success).toHaveBeenCalledWith(COPY.rebind.done('Platform'));
    });

    it('drops the rebuild range and the replay payload when rebuild is unchecked', async () => {
      otel.rebind.mockResolvedValueOnce({ connection: boundConnection() });
      renderRebind();
      expect(screen.getByText(COPY.range.label)).toBeTruthy();

      fireEvent.click(screen.getByRole('checkbox', { name: COPY.rebind.rebuild }));
      expect(screen.queryByText(COPY.range.label)).toBeNull();
      await rebindThrough();

      await waitFor(() => expect(otel.rebind).toHaveBeenCalledOnce());
      expect(otel.rebind.mock.calls[0][1].replay).toBeUndefined();
    });

    it('shows the revoked notice and ends the default range on the revoke day', async () => {
      const revokedAt = dayjs.utc().subtract(3, 'day');
      otel.rebind.mockResolvedValueOnce({ connection: boundConnection() });
      renderRebind(boundConnection({ status: OTEL_STATUS.REVOKED, revokedAt: revokedAt.toISOString() }));

      expect(screen.getByText(COPY.rebind.revoked)).toBeTruthy();
      expect(screen.queryByText(COPY.rebind.acceptOnly)).toBeNull();
      await rebindThrough();

      await waitFor(() => expect(otel.rebind).toHaveBeenCalledOnce());
      expect(otel.rebind.mock.calls[0][1].replay?.endDate).toBe(revokedAt.format('YYYY-MM-DD'));
    });

    it('defaults rebuild off for an unbound connection and omits the previous-organization hint', () => {
      renderRebind(boundConnection({ organizationId: null }));

      const rebuild = screen.getByRole('checkbox', { name: COPY.rebind.rebuild });
      expect(rebuild).toHaveProperty('checked', false);
      expect(screen.getByText(COPY.rebind.notBound)).toBeTruthy();
      fireEvent.click(rebuild);
      expect(screen.getByText(COPY.rebind.rebuildHint)).toBeTruthy();
      expect(screen.queryByText(COPY.rebind.previousOrg)).toBeNull();
    });
  });

  it('rebuilds every team only after the confirm and sends no connection', async () => {
    const onQueued = vi.fn();
    otel.createReplay.mockResolvedValueOnce({ queued: [], reused: [] });
    renderWithTheme(<ReplayModal open onClose={vi.fn()} onQueued={onQueued} />);
    const { min, max } = getReplayDateLimits(new Date());

    fireEvent.click(await screen.findByRole('button', { name: COPY.replayModal.submit }));
    expect(otel.createReplay).not.toHaveBeenCalled();
    expect(await screen.findByText(COPY.replayModal.confirm.title())).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: COPY.replayModal.confirm.confirm }).at(-1) as HTMLElement);

    await waitFor(() => expect(onQueued).toHaveBeenCalledOnce());
    expect(otel.createReplay).toHaveBeenCalledWith({ startDate: min, endDate: max });
    expect(otel.createReplay.mock.calls[0][0]).not.toHaveProperty('requestedForConnectionId');
  });
});
