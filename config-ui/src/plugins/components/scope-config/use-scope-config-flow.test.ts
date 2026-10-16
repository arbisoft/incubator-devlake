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

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { messageMock } from '@/ui/__tests__/mock-message';

import { COPY, NO_SCOPE_CONFIG_ID, SCOPE_CONFIG_DIALOG } from './constants';
import { useScopeConfigFlow } from './use-scope-config-flow';

vi.mock('@/api', () => ({
  default: {
    scope: { update: vi.fn(), get: vi.fn() },
    scopeConfig: { check: vi.fn() },
    blueprint: { trigger: vi.fn() },
  },
}));

vi.mock('antd', async (importOriginal) =>
  (await import('@/ui/__tests__/mock-message')).withMockedMessage(await importOriginal<typeof import('antd')>()),
);

const scopeUpdate = vi.mocked(API.scope.update);
const scopeGet = vi.mocked(API.scope.get);
const checkConfig = vi.mocked(API.scopeConfig.check);
const trigger = vi.mocked(API.blueprint.trigger);

const setup = (scopeConfigId?: ID) => {
  const onSuccess = vi.fn();
  const hook = renderHook(() =>
    useScopeConfigFlow({
      plugin: 'github',
      connectionId: 1,
      scopeId: 'repo',
      scopeName: 'repo',
      scopeConfigId,
      onSuccess,
    }),
  );
  return { ...hook, onSuccess };
};

describe('useScopeConfigFlow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens the associate dialog', () => {
    const { result } = setup();
    act(() => result.current.openAssociate());
    expect(result.current.dialog).toBe(SCOPE_CONFIG_DIALOG.ASSOCIATE);
    act(() => result.current.closeDialog());
    expect(result.current.dialog).toBeUndefined();
  });

  it('associates a config and lists the projects that now need a re-transform', async () => {
    scopeUpdate.mockResolvedValue({});
    scopeGet.mockResolvedValue({ blueprints: [{ id: 3, projectName: 'p1' }] });
    const { result, onSuccess } = setup();
    await act(async () => result.current.associate(7));
    expect(scopeUpdate).toHaveBeenCalledWith('github', 1, 'repo', { scopeConfigId: 7 });
    expect(result.current.savedProjects).toEqual([{ name: 'p1', blueprintId: 3 }]);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('removes the association for "no scope config" and finishes when no project is affected', async () => {
    scopeUpdate.mockResolvedValue({});
    scopeGet.mockResolvedValue({ blueprints: [] });
    const { result, onSuccess } = setup();
    await act(async () => result.current.associate(NO_SCOPE_CONFIG_ID));
    expect(scopeUpdate).toHaveBeenCalledWith('github', 1, 'repo', { scopeConfigId: null });
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('explains a failed association', async () => {
    scopeUpdate.mockRejectedValue(new Error('boom'));
    const { result, onSuccess } = setup();
    await act(async () => result.current.associate(7));
    expect(messageMock.error).toHaveBeenCalledWith(COPY.associateFailed);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('edits straight away when one project uses the config', async () => {
    checkConfig.mockResolvedValue({ count: 1, projects: [{ name: 'p1', blueprintId: 3 }] });
    const { result } = setup(5);
    await act(async () => result.current.openUpdate());
    expect(result.current.dialog).toBe(SCOPE_CONFIG_DIALOG.UPDATE);
  });

  it('asks first when several projects share the config, then continues or duplicates', async () => {
    checkConfig.mockResolvedValue({
      count: 2,
      projects: [
        { name: 'p1', blueprintId: 3, scopes: [{ scopeName: 'repo' }] },
        { name: 'p2', blueprintId: 4, scopes: [{ scopeName: 'repo' }] },
      ],
    });
    const { result } = setup(5);
    await act(async () => result.current.openUpdate());
    expect(result.current.dialog).toBe(SCOPE_CONFIG_DIALOG.RELATED_PROJECTS);
    expect(result.current.relatedProjects).toHaveLength(2);

    act(() => result.current.openDuplicate());
    expect(result.current.dialog).toBe(SCOPE_CONFIG_DIALOG.DUPLICATE);
    act(() => result.current.continueUpdate());
    expect(result.current.dialog).toBe(SCOPE_CONFIG_DIALOG.UPDATE);
  });

  it('does nothing when there is no config to edit', async () => {
    const { result } = setup();
    await act(async () => result.current.openUpdate());
    expect(checkConfig).not.toHaveBeenCalled();
  });

  it('explains a failed check', async () => {
    checkConfig.mockRejectedValue(new Error('boom'));
    const { result } = setup(5);
    await act(async () => result.current.openUpdate());
    expect(messageMock.error).toHaveBeenCalledWith(COPY.checkFailed);
    expect(result.current.dialog).toBeUndefined();
  });

  it('shows the saved projects after an update and closes into onSuccess', async () => {
    checkConfig.mockResolvedValue({ count: 1, projects: [{ name: 'p1', blueprintId: 3 }] });
    const { result, onSuccess } = setup(5);
    await act(async () => result.current.update(5));
    expect(result.current.savedProjects).toEqual([{ name: 'p1', blueprintId: 3 }]);
    act(() => result.current.closeSaved());
    expect(result.current.savedProjects).toBeUndefined();
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('re-transforms a project without collecting and opens it', async () => {
    trigger.mockResolvedValue({});
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = setup();
    await act(async () => result.current.retransform({ name: 'p1', blueprintId: 3 }));
    expect(trigger).toHaveBeenCalledWith(3, { skipCollectors: true });
    expect(open).toHaveBeenCalledOnce();
    open.mockRestore();
  });
});
