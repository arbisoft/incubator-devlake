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

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY, SCOPE_CONFIG_DIALOG } from './constants';
import { ScopeConfig } from './scope-config';

const mocks = vi.hoisted(() => ({
  dialog: undefined as string | undefined,
  relatedProjects: [] as Array<{ name: string; scopes: Array<{ scopeName: string }> }>,
  savedProjects: undefined as Array<{ name: string; blueprintId: ID }> | undefined,
  operating: false,
  openAssociate: vi.fn(),
  openUpdate: vi.fn(),
  closeDialog: vi.fn(),
  associate: vi.fn(),
  update: vi.fn(),
  continueUpdate: vi.fn(),
  openDuplicate: vi.fn(),
  retransform: vi.fn(),
  closeSaved: vi.fn(),
}));

vi.mock('@/plugins/utils', () => ({
  getPluginConfig: (plugin: string) => ({ scopeConfig: plugin === 'github' || plugin === 'tapd' }),
}));

vi.mock('../connection-modal', () => ({
  ConnectionModal: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="connection-modal">{children}</div> : null,
}));

vi.mock('../scope-config-form', () => ({ ScopeConfigForm: () => <div data-testid="scope-config-form" /> }));

vi.mock('../scope-config-select', () => ({
  ScopeConfigSelectModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="scope-config-select-modal" /> : null,
}));

vi.mock('./related-projects-dialog', () => ({
  RelatedProjectsDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="related-projects-dialog" /> : null),
}));

vi.mock('./saved-dialog', () => ({
  SavedDialog: ({ projects }: { projects: Array<{ name: string; blueprintId: ID }> | undefined }) =>
    projects?.length ? <div data-testid="saved-dialog" /> : null,
}));

vi.mock('./use-scope-config-flow', () => ({
  useScopeConfigFlow: () => mocks,
}));

const props = {
  connectionId: 1,
  scopeId: 2,
  scopeName: 'repository',
  onSuccess: vi.fn(),
};

const UNSUPPORTED_DIALOGS = {
  connection: 'connection-modal',
  form: 'scope-config-form',
  select: 'scope-config-select-modal',
  related: 'related-projects-dialog',
  saved: 'saved-dialog',
} as const;

const expectNoUnsupportedDialogs = () => {
  Object.values(UNSUPPORTED_DIALOGS).forEach((testId) => expect(screen.queryByTestId(testId)).toBeNull());
};

const expectUnsupportedActionsAbsent = () => {
  expect(screen.queryByRole('button', { name: COPY.associate })).toBeNull();
  expect(screen.queryByRole('button', { name: COPY.edit })).toBeNull();
  expectNoUnsupportedDialogs();
};

describe('ScopeConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dialog = undefined;
    mocks.savedProjects = undefined;
  });

  it('keeps unsupported empty cells free of actions and dialogs', () => {
    renderWithTheme(<ScopeConfig {...props} plugin="sonarqube" />);

    expect(screen.getByText(COPY.empty)).toBeTruthy();
    expectUnsupportedActionsAbsent();
  });

  it('retains historical names without exposing unsupported actions', () => {
    renderWithTheme(<ScopeConfig {...props} plugin="sonarqube" scopeConfigId={3} scopeConfigName="Legacy config" />);

    expect(screen.getByText('Legacy config')).toBeTruthy();
    expectUnsupportedActionsAbsent();
  });

  it('keeps supported GitHub associate and edit actions available', () => {
    const { rerender } = renderWithTheme(<ScopeConfig {...props} plugin="github" />);

    expect(screen.getByRole('button', { name: COPY.associate })).toBeTruthy();
    expect(screen.queryByRole('button', { name: COPY.edit })).toBeNull();

    rerender(<ScopeConfig {...props} plugin="github" scopeConfigId={4} scopeConfigName="Production config" />);

    expect(screen.getByText('Production config')).toBeTruthy();
    expect(screen.getByRole('button', { name: COPY.associate })).toBeTruthy();
    expect(screen.getByRole('button', { name: COPY.edit })).toBeTruthy();
  });

  it('keeps the TAPD association form path', () => {
    mocks.dialog = SCOPE_CONFIG_DIALOG.ASSOCIATE;
    renderWithTheme(<ScopeConfig {...props} plugin="tapd" />);

    expect(screen.getByTestId('connection-modal')).toBeTruthy();
    expect(screen.getByTestId('scope-config-form')).toBeTruthy();
    expect(screen.queryByTestId(UNSUPPORTED_DIALOGS.select)).toBeNull();
  });
});
