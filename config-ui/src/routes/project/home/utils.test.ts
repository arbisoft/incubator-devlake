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
import { IPipelineStatus, type IProject } from '@/types';

import { PROJECT_METRICS } from './constants';
import { buildNewProject, toProjectRow } from './utils';

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
