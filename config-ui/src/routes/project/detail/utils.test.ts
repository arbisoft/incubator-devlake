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

import { describe, expect, it } from 'vitest';

import { OTEL_STATUS, type OtelConnectionResponse } from '@/api/otel';
import { PROJECT_TAB } from '@/config';
import { IBPMode, type IBlueprint, type IProject } from '@/types';

import { COPY, DEFAULT_PR_ISSUE_REGEXP, DELETE_WARNING } from './constants';
import {
  attachWebhooks,
  buildProjectPayload,
  detachWebhook,
  getDeleteWarnings,
  getOtelPlacementState,
  getProjectTabs,
  getWebhookIds,
  readSettingsForm,
  toProjectTab,
} from './utils';

describe('getProjectTabs', () => {
  it('lists the four tabs in order with their URLs', () => {
    expect(getProjectTabs('a b')).toEqual([
      { key: PROJECT_TAB.BLUEPRINT, label: COPY.tabs.blueprint, path: '/projects/a%20b/blueprint' },
      { key: PROJECT_TAB.WEBHOOKS, label: COPY.tabs.webhooks, path: '/projects/a%20b/webhooks' },
      {
        key: PROJECT_TAB.CLAUDE_CODE_OTEL,
        label: COPY.tabs['claude-code-otel'],
        path: '/projects/a%20b/claude-code-otel',
      },
      { key: PROJECT_TAB.SETTINGS, label: COPY.tabs.settings, path: '/projects/a%20b/settings' },
    ]);
  });

  it('hides no tab', () => {
    expect(getProjectTabs('a').every(({ visible }) => visible !== false)).toBe(true);
  });
});

describe('toProjectTab', () => {
  it('keeps a known tab and falls back to the blueprint tab', () => {
    expect(toProjectTab(PROJECT_TAB.SETTINGS)).toBe(PROJECT_TAB.SETTINGS);
    expect(toProjectTab('elsewhere')).toBe(PROJECT_TAB.BLUEPRINT);
    expect(toProjectTab(undefined)).toBe(PROJECT_TAB.BLUEPRINT);
  });
});

const BLUEPRINT: IBlueprint = {
  id: 4,
  name: 'bp',
  projectName: 'p',
  mode: IBPMode.NORMAL,
  enable: true,
  isManual: false,
  cronConfig: '0 0 * * *',
  skipOnFail: true,
  plan: null,
  timeAfter: null,
  connections: [
    { pluginName: 'github', connectionId: 1, scopes: [{ scopeId: 's' }] },
    { pluginName: 'webhook', connectionId: 1 },
    { pluginName: 'webhook', connectionId: 2 },
  ],
};

describe('project webhooks', () => {
  it('lists only the webhook connections of the blueprint', () => {
    expect(getWebhookIds(BLUEPRINT)).toEqual([1, 2]);
    expect(getWebhookIds(null)).toEqual([]);
  });

  it('appends webhooks without touching the other connections', () => {
    const next = attachWebhooks(BLUEPRINT, [3, 4]);
    expect(next.connections.slice(0, 3)).toEqual(BLUEPRINT.connections);
    expect(next.connections.slice(3)).toEqual([
      { pluginName: 'webhook', connectionId: 3 },
      { pluginName: 'webhook', connectionId: 4 },
    ]);
  });

  it('does not attach a webhook twice', () => {
    expect(attachWebhooks(BLUEPRINT, [2, 3]).connections.slice(3)).toEqual([
      { pluginName: 'webhook', connectionId: 3 },
    ]);
  });

  it('detaches one webhook and keeps a non-webhook connection with the same id', () => {
    expect(detachWebhook(BLUEPRINT, 1).connections).toEqual([
      BLUEPRINT.connections[0],
      { pluginName: 'webhook', connectionId: 2 },
    ]);
  });
});

const NAME = 'Arbisoft Website';

const PROJECT: IProject = {
  name: NAME,
  description: '',
  blueprint: BLUEPRINT,
  metrics: [
    { pluginName: 'dora', pluginOption: {}, enable: true },
    { pluginName: 'linker', pluginOption: { prToIssueRegexp: '(x)' }, enable: true },
  ],
};

describe('project settings form', () => {
  it('reads each metric and falls back to the defaults', () => {
    expect(readSettingsForm(PROJECT)).toEqual({
      name: NAME,
      dora: true,
      linker: true,
      linkerRegexp: '(x)',
      issueTrace: false,
    });
    expect(readSettingsForm({ ...PROJECT, metrics: [] })).toEqual({
      name: NAME,
      dora: false,
      linker: false,
      linkerRegexp: DEFAULT_PR_ISSUE_REGEXP,
      issueTrace: false,
    });
  });

  it('treats a project without a metrics list as having none enabled', () => {
    expect(readSettingsForm({ ...PROJECT, metrics: null as never }).dora).toBe(false);
  });

  it('sends the same payload the page has always sent', () => {
    expect(
      buildProjectPayload({ name: 'n', dora: true, linker: false, linkerRegexp: '(y)', issueTrace: true }),
    ).toEqual({
      name: 'n',
      description: '',
      metrics: [
        { pluginName: 'dora', pluginOption: {}, enable: true },
        { pluginName: 'linker', pluginOption: { prToIssueRegexp: '(y)' }, enable: false },
        { pluginName: 'issue_trace', pluginOption: {}, enable: true },
      ],
    });
  });
});

const placement = (status: OtelConnectionResponse['connection']['status'], projects: number) =>
  ({
    connection: { status },
    projects: Array.from({ length: projects }, (_, index) => ({ name: `p${index}` })),
  }) as OtelConnectionResponse;

describe('project delete warnings', () => {
  it('warns about nothing when no placement exists or none is loaded', () => {
    expect(getDeleteWarnings(getOtelPlacementState([]))).toEqual([]);
    expect(getDeleteWarnings(getOtelPlacementState(undefined))).toEqual([]);
  });

  it('says the placements are removed when they are shared or revoked', () => {
    const shared = getOtelPlacementState([placement(OTEL_STATUS.ACTIVE, 2)]);
    const revoked = getOtelPlacementState([placement(OTEL_STATUS.REVOKED, 1)]);
    expect(getDeleteWarnings(shared)).toEqual([DELETE_WARNING.OTEL_REMOVED]);
    expect(getDeleteWarnings(revoked)).toEqual([DELETE_WARNING.OTEL_REMOVED]);
  });

  it('blocks the delete when this project is the last placement of an active connection', () => {
    const state = getOtelPlacementState([placement(OTEL_STATUS.ACTIVE, 2), placement(OTEL_STATUS.ACTIVE, 1)]);
    expect(state).toEqual({ hasPlacements: true, hasActiveFinal: true });
    expect(getDeleteWarnings(state)).toEqual([DELETE_WARNING.OTEL_FINAL_ACTIVE]);
  });
});
