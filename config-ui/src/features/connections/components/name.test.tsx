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

import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RootState } from '@/app/store';
import { useAppSelector } from '@/hooks';
import { getPluginConfig } from '@/plugins';
import type { IConnection, IWebhook } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY, WEBHOOK_PLUGIN } from '../constants';
import { selectConnection, selectWebhook } from '../slice';

import { ConnectionName } from './name';

vi.mock('@/hooks', () => ({ useAppSelector: vi.fn() }));
vi.mock('@/plugins', () => ({ getPluginConfig: vi.fn() }));
vi.mock('../slice', () => ({ selectConnection: vi.fn(), selectWebhook: vi.fn() }));

const state = {} as RootState;
const webhook: IWebhook = {
  id: 7,
  name: 'Webhook connection',
  postIssuesEndpoint: '',
  closeIssuesEndpoint: '',
  postPipelineDeployTaskEndpoint: '',
  postPullRequestsEndpoint: '',
  apiKeyId: 1,
};
const connection = (patch: Partial<IConnection> = {}): IConnection =>
  ({ id: 7, unique: 'github-7', plugin: 'github', name: 'Saved connection', ...patch }) as IConnection;

describe('ConnectionName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAppSelector).mockImplementation((selector) => selector(state));
    vi.mocked(getPluginConfig).mockReturnValue({ icon: () => <svg aria-hidden="true" /> } as unknown as ReturnType<
      typeof getPluginConfig
    >);
    vi.mocked(selectConnection).mockReturnValue(undefined);
    vi.mocked(selectWebhook).mockReturnValue(undefined);
  });

  it('uses the ordinary fallback when a missing plugin connection shares a webhook id', () => {
    vi.mocked(selectWebhook).mockReturnValue(webhook);
    const fallback = COPY.connectionNameFallback('github', 7);
    renderWithTheme(<ConnectionName plugin="github" connectionId={7} />);
    expect(screen.getByText(fallback)).toBeTruthy();
    expect(selectWebhook).not.toHaveBeenCalled();
  });

  it('resolves the webhook name for a webhook connection', () => {
    vi.mocked(selectWebhook).mockReturnValue(webhook);
    renderWithTheme(<ConnectionName plugin={WEBHOOK_PLUGIN} connectionId={7} />);
    expect(screen.getByText(webhook.name)).toBeTruthy();
    expect(selectWebhook).toHaveBeenCalledWith(state, 7);
  });

  it('prefers the saved ordinary connection when both selectors could return a name', () => {
    vi.mocked(selectConnection).mockReturnValue(connection());
    vi.mocked(selectWebhook).mockReturnValue(webhook);
    renderWithTheme(<ConnectionName plugin="github" connectionId={7} />);
    expect(screen.getByText('Saved connection')).toBeTruthy();
    expect(selectWebhook).not.toHaveBeenCalled();
  });

  it('shows the fallback label when neither connection is known', () => {
    const fallback = COPY.connectionNameFallback('gitlab', 11);
    renderWithTheme(<ConnectionName plugin="gitlab" connectionId={11} />);
    expect(screen.getByText(fallback)).toBeTruthy();
  });
});
