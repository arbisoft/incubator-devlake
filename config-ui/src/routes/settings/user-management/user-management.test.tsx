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

import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { PATHS } from '@/config';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from './constants';
import { SettingsUserManagement } from './user-management';

vi.mock('../users', () => ({ DevlakeUsers: () => <p>devlake body</p> }));
vi.mock('../grafana-users', () => ({ GrafanaUsers: () => <p>grafana body</p> }));

const setup = (path: string) =>
  renderWithTheme(
    <MemoryRouter initialEntries={[path]}>
      <SettingsUserManagement />
    </MemoryRouter>,
  );

describe('SettingsUserManagement', () => {
  it('shows the DevLake tab on the users route, with its description and breadcrumbs', () => {
    setup(PATHS.SETTINGS_USERS());
    expect(screen.getByRole('heading', { name: COPY.title })).toBeTruthy();
    expect(screen.getByText('devlake body')).toBeTruthy();
    expect(screen.getByText(COPY.descriptions.devlake)).toBeTruthy();
    expect(screen.getByText(COPY.breadcrumbViews.devlake)).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('radio', { name: COPY.views.devlake }).checked).toBe(true);
  });

  it('shows the Grafana tab on its own route', () => {
    setup(PATHS.SETTINGS_GRAFANA_USERS());
    expect(screen.getByText('grafana body')).toBeTruthy();
    expect(screen.getByText(COPY.descriptions.grafana)).toBeTruthy();
    expect(screen.getByText(COPY.breadcrumbViews.grafana)).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('radio', { name: COPY.views.grafana }).checked).toBe(true);
  });

  it('switches tabs through the segmented switcher', () => {
    setup(PATHS.SETTINGS_USERS());
    fireEvent.click(screen.getByRole('radio', { name: COPY.views.grafana }));
    expect(screen.getByText('grafana body')).toBeTruthy();
    expect(screen.queryByText('devlake body')).toBeNull();
  });
});
