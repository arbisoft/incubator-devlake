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

import type { OtelConnectionResponse } from '@/api/otel';
import { OTEL_INTEGRATION_KEY } from '@/routes/connection/constants';
import { PIPELINE_STATUS_COPY } from '@/routes/pipeline/status-tone';
import { IPipelineStatus, type IProject } from '@/types';

import {
  CONNECTION_ENTRY_KIND,
  LAST_RUN_STATUS_GROUP,
  LAST_RUN_STATUS_GROUP_STATUSES,
  LAST_RUN_STATUS_OPTIONS,
  PROJECT_METRICS,
} from './constants';
import type { ProjectRow } from './types';
import {
  buildNewProject,
  buildProjectQuery,
  describeConnectionEntry,
  getConnectionEntries,
  toProjectRow,
} from './utils';

const otel = (id: number, projects: string[]) =>
  ({ connection: { id, name: `team-${id}` }, projects: projects.map((name) => ({ name })) }) as OtelConnectionResponse;

const PROJECT = {
  name: 'alpha',
  createdAt: '2026-06-06T16:00:00Z',
  blueprint: { isManual: false, cronConfig: '0 0 * * *', connections: [{ pluginName: 'github', connectionId: 1 }] },
  lastPipeline: { status: IPipelineStatus.COMPLETED, finishedAt: '2026-08-20T05:07:00Z' },
} as IProject;

describe('toProjectRow', () => {
  it('flattens the blueprint and the last pipeline', () => {
    expect(toProjectRow(PROJECT)).toEqual({
      name: 'alpha',
      connections: [{ pluginName: 'github', connectionId: 1 }],
      otelConnections: [],
      isManual: false,
      cronConfig: '0 0 * * *',
      createdAt: '2026-06-06T16:00:00Z',
      lastRunCompletedAt: '2026-08-20T05:07:00Z',
      lastRunStatus: IPipelineStatus.COMPLETED,
    });
  });

  it('keeps only the OTel connections linked to the project', () => {
    const row = toProjectRow(PROJECT, [otel(1, ['alpha', 'beta']), otel(2, ['beta'])]);
    expect(row.otelConnections.map((item) => item.connection.id)).toEqual([1]);
  });

  it('copes with a project that has no blueprint or run yet', () => {
    const row = toProjectRow({ name: 'empty' } as IProject);
    expect(row).toMatchObject({ connections: [], otelConnections: [], isManual: false, cronConfig: '' });
    expect(row.lastRunStatus).toBeUndefined();
    expect(row.lastRunCompletedAt).toBeUndefined();
  });
});

describe('buildNewProject', () => {
  it('creates the project with the default metrics and no description', () => {
    expect(buildNewProject('alpha')).toEqual({ name: 'alpha', description: '', metrics: PROJECT_METRICS });
  });
});

describe('getConnectionEntries', () => {
  const ROW = toProjectRow(PROJECT, [otel(4, ['alpha'])]);

  it('lists the plugin connections first, then the OTel ones, each with a unique key', () => {
    const entries = getConnectionEntries(ROW);
    expect(entries.map(({ kind, key }) => [kind, key])).toEqual([
      [CONNECTION_ENTRY_KIND.PLUGIN, 'github-1'],
      [CONNECTION_ENTRY_KIND.OTEL, 'claude_otel-4'],
    ]);
  });

  it('is empty for a project with no connection of any kind', () => {
    expect(getConnectionEntries({ connections: [], otelConnections: [] } as unknown as ProjectRow)).toEqual([]);
  });
});

describe('buildProjectQuery', () => {
  const QUERY = { page: 2, pageSize: 20, keyword: 'a' };

  it('leaves the filters out when none are selected', () => {
    expect(buildProjectQuery(QUERY, { connection: [], lastRunStatus: [] })).toEqual({
      ...QUERY,
      connection: undefined,
      lastRunStatus: undefined,
    });
  });

  it('passes connections through and expands each status group to its statuses', () => {
    const query = buildProjectQuery(QUERY, {
      connection: ['github:1', 'claude_otel:4'],
      lastRunStatus: [LAST_RUN_STATUS_GROUP.IN_PROGRESS, LAST_RUN_STATUS_GROUP.FAILED],
    });
    expect(query.connection).toEqual(['github:1', 'claude_otel:4']);
    expect(query.lastRunStatus).toEqual([
      ...LAST_RUN_STATUS_GROUP_STATUSES.inProgress,
      ...LAST_RUN_STATUS_GROUP_STATUSES.failed,
    ]);
  });

  it('dedupes statuses and ignores unknown groups', () => {
    const query = buildProjectQuery(QUERY, {
      connection: [],
      lastRunStatus: [LAST_RUN_STATUS_GROUP.FAILED, LAST_RUN_STATUS_GROUP.FAILED, 'bogus'],
    });
    expect(query.lastRunStatus).toEqual([...LAST_RUN_STATUS_GROUP_STATUSES.failed]);
  });
});

describe('LAST_RUN_STATUS_OPTIONS', () => {
  it('offers one option per group, labelled like the status badge', () => {
    expect(LAST_RUN_STATUS_OPTIONS.map(({ value }) => value)).toEqual(Object.values(LAST_RUN_STATUS_GROUP));
    expect(LAST_RUN_STATUS_OPTIONS.find(({ value }) => value === LAST_RUN_STATUS_GROUP.IN_PROGRESS)?.text).toBe(
      PIPELINE_STATUS_COPY[IPipelineStatus.RUNNING],
    );
  });
});

describe('describeConnectionEntry', () => {
  it('carries the plugin key of a connector entry', () => {
    const [entry] = getConnectionEntries({ ...toProjectRow(PROJECT) });
    expect(describeConnectionEntry(entry, [], []).plugin).toBe('github');
  });

  it('uses the OTel integration key for an OTel entry', () => {
    const [entry] = getConnectionEntries({
      ...toProjectRow(PROJECT),
      connections: [],
      otelConnections: [otel(3, ['alpha'])],
    });
    expect(describeConnectionEntry(entry, [], []).plugin).toBe(OTEL_INTEGRATION_KEY);
  });
});
