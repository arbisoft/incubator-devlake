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
import type { IBlueprint } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { BLUEPRINT_CONTEXT, COPY } from './constants';
import { StatusActions } from './status-actions';
import type { BlueprintContext } from './types';

vi.mock('antd', async (importOriginal) =>
  (await import('@/ui/__tests__/antd-message-mock')).withMockedMessage(await importOriginal<typeof import('antd')>()),
);

vi.mock('@/api', () => ({
  default: { blueprint: { trigger: vi.fn(), update: vi.fn(), remove: vi.fn() } },
}));

const api = vi.mocked(API.blueprint);

const BLUEPRINT = {
  id: 7,
  name: 'nightly',
  projectName: '',
  enable: true,
  isManual: true,
  cronConfig: '0 0 * * *',
} as IBlueprint;

const setup = (context: BlueprintContext, blueprint: Partial<IBlueprint> = {}) => {
  const onRefresh = vi.fn();
  renderWithTheme(
    <MemoryRouter>
      <StatusActions context={context} blueprint={{ ...BLUEPRINT, ...blueprint }} onRefresh={onRefresh} />
    </MemoryRouter>,
  );
  return { onRefresh };
};

describe('StatusActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.trigger.mockResolvedValue({});
    api.update.mockResolvedValue({});
    api.remove.mockResolvedValue({});
  });

  describe('for a project', () => {
    it('shows the schedule, the run buttons and the more menu', () => {
      setup(BLUEPRINT_CONTEXT.PROJECT);
      expect(screen.getByText(COPY.actions.manual)).toBeTruthy();
      expect(screen.getByRole('button', { name: COPY.actions.reTransform })).toBeTruthy();
      expect(screen.getByRole('button', { name: COPY.actions.collect })).toBeTruthy();
      expect(screen.getByRole('button', { name: COPY.actions.more })).toBeTruthy();
      expect(screen.queryByRole('button', { name: COPY.actions.runNow })).toBeNull();
    });

    it('collects data, then refreshes', async () => {
      const { onRefresh } = setup(BLUEPRINT_CONTEXT.PROJECT);
      fireEvent.click(screen.getByRole('button', { name: COPY.actions.collect }));
      await waitFor(() => expect(onRefresh).toHaveBeenCalled());
      expect(api.trigger).toHaveBeenCalledWith(7, { skipCollectors: false, fullSync: false });
    });

    it('re-transforms by skipping the collectors and syncing in full', async () => {
      setup(BLUEPRINT_CONTEXT.PROJECT);
      fireEvent.click(screen.getByRole('button', { name: COPY.actions.reTransform }));
      await waitFor(() => expect(api.trigger).toHaveBeenCalledWith(7, { skipCollectors: true, fullSync: true }));
    });

    it('asks before a full refresh and then runs it', async () => {
      const { onRefresh } = setup(BLUEPRINT_CONTEXT.PROJECT);
      fireEvent.click(screen.getByRole('button', { name: COPY.actions.more }));
      fireEvent.click(await screen.findByRole('menuitem', { name: COPY.actions.fullRefresh }));
      const dialog = await screen.findByRole('dialog', { name: COPY.actions.fullRefresh });
      expect(api.trigger).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: COPY.actions.runNow }));
      await waitFor(() => expect(api.trigger).toHaveBeenCalledWith(7, { skipCollectors: false, fullSync: true }));
      await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    });

    it('disables every run action while the blueprint is disabled', async () => {
      setup(BLUEPRINT_CONTEXT.PROJECT, { enable: false });
      expect(screen.getByRole('button', { name: COPY.actions.reTransform }).hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('button', { name: COPY.actions.collect }).hasAttribute('disabled')).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: COPY.actions.more }));
      const item = await screen.findByRole('menuitem', { name: COPY.actions.fullRefresh });
      expect(item.getAttribute('aria-disabled')).toBe('true');
    });

    it('shows the next run for a scheduled blueprint', () => {
      setup(BLUEPRINT_CONTEXT.PROJECT, { isManual: false });
      expect(screen.getByText(/^Next run: /)).toBeTruthy();
    });
  });

  describe('for an advanced blueprint', () => {
    it('shows run now, the enabled switch and delete', () => {
      setup(BLUEPRINT_CONTEXT.ADVANCED);
      expect(screen.getByRole('button', { name: COPY.actions.runNow })).toBeTruthy();
      expect(screen.getByRole('switch')).toBeTruthy();
      expect(screen.getByRole('button', { name: COPY.actions.delete })).toBeTruthy();
      expect(screen.queryByRole('button', { name: COPY.actions.collect })).toBeNull();
    });

    it('switches the blueprint off', async () => {
      const { onRefresh } = setup(BLUEPRINT_CONTEXT.ADVANCED);
      fireEvent.click(screen.getByRole('switch'));
      await waitFor(() => expect(onRefresh).toHaveBeenCalled());
      expect(api.update).toHaveBeenCalledWith(7, expect.objectContaining({ id: 7, enable: false }));
    });

    it('names the blueprint in the delete confirm and deletes only after confirming', async () => {
      setup(BLUEPRINT_CONTEXT.ADVANCED);
      fireEvent.click(screen.getByRole('button', { name: COPY.actions.delete }));
      const dialog = await screen.findByRole('dialog', { name: /nightly/ });
      expect(api.remove).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: COPY.actions.delete }));
      await waitFor(() => expect(api.remove).toHaveBeenCalledWith(7));
    });

    it('locks the switch and delete when a project owns the blueprint', () => {
      setup(BLUEPRINT_CONTEXT.ADVANCED, { projectName: 'demo' });
      expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('button', { name: COPY.actions.delete }).hasAttribute('disabled')).toBe(true);
    });

    it('disables run now while the blueprint is disabled', () => {
      setup(BLUEPRINT_CONTEXT.ADVANCED, { enable: false });
      expect(screen.getByRole('button', { name: COPY.actions.runNow }).hasAttribute('disabled')).toBe(true);
    });
  });
});
