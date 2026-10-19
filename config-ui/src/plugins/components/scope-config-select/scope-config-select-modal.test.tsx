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
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY, NO_SCOPE_CONFIG } from './constants';
import { ScopeConfigSelectModal } from './scope-config-select-modal';
import type { ScopeConfigSelectModalProps } from './types';

const CONFIGS = [
  { id: 1, name: 'config-one' },
  { id: 2, name: 'config-two' },
];

vi.mock('@/api', () => ({ default: { scopeConfig: { list: vi.fn() } } }));
vi.mock('@/hooks', () => ({ useRefreshData: () => ({ ready: true, data: CONFIGS, error: undefined }) }));
vi.mock('@/plugins/utils', () => ({ getPluginConfig: () => ({ icon: () => null }) }));
vi.mock('../connection-modal', () => ({ ConnectionModal: () => null }));
vi.mock('../scope-config-form', () => ({ ScopeConfigForm: () => null }));

const TITLE = 'Associate Scope Config';

const setup = (props: Partial<ScopeConfigSelectModalProps> = {}) => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  renderWithTheme(
    <ScopeConfigSelectModal
      open
      plugin="github"
      connectionId={1}
      title={TITLE}
      onCancel={onCancel}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onSubmit, onCancel };
};

describe('ScopeConfigSelectModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the scope configs in a named dialog', () => {
    setup();
    expect(screen.getByRole('dialog', { name: TITLE })).toBeTruthy();
    expect(screen.getByRole('table', { name: COPY.tableLabel })).toBeTruthy();
    expect(screen.getByText('config-one')).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(COPY.add) })).toBeTruthy();
  });

  it('cannot save until a config is picked, then saves the picked one', () => {
    const { onSubmit } = setup();
    fireEvent.click(screen.getByRole('button', { name: COPY.save }));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('config-two'));
    fireEvent.click(screen.getByRole('button', { name: COPY.save }));
    expect(onSubmit).toHaveBeenCalledWith(2);
  });

  it('starts with the associated config selected and offers to remove it', () => {
    const { onSubmit } = setup({ scopeConfigId: 1 });
    expect(screen.getByText(NO_SCOPE_CONFIG.name)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: COPY.save }));
    expect(onSubmit).toHaveBeenCalledWith(1);
  });

  it('can pick "no scope config" to clear the association', () => {
    const { onSubmit } = setup({ scopeConfigId: 1 });
    fireEvent.click(screen.getByText(NO_SCOPE_CONFIG.name));
    fireEvent.click(screen.getByRole('button', { name: COPY.save }));
    expect(onSubmit).toHaveBeenCalledWith(NO_SCOPE_CONFIG.id);
  });
});
