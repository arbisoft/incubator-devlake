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

import { COPY, LOG_STATUS } from './constants';
import { buildOnboardBlueprintUpdatePayload, getCompletionPercent, getLogStatusText, toSyncLog } from './utils';

describe('routes/onboard/utils', () => {
  it('github onboard blueprint update payload does not set timeAfter', () => {
    const payload = buildOnboardBlueprintUpdatePayload('github', 1, [{ data: { githubId: 1001 } }]);

    expect(Object.hasOwn(payload, 'timeAfter')).toBe(false);
    expect(payload).toStrictEqual({
      connections: [
        {
          pluginName: 'github',
          connectionId: 1,
          scopes: [{ scopeId: '1001' }],
        },
      ],
    });
  });

  it('non-github onboard blueprint update payload preserves the previous explicit 14-day timeAfter', () => {
    const payload = buildOnboardBlueprintUpdatePayload(
      'jira',
      1,
      [{ data: { boardId: 1001 } }],
      new Date('2026-06-08T12:34:56Z'),
    );

    expect(Object.hasOwn(payload, 'timeAfter')).toBe(true);
    // formatTime is called with { utc: true } so the offset is always +00:00.
    expect(payload.timeAfter).toBe('2026-05-25T00:00:00+00:00');
    expect(payload.connections).toStrictEqual([
      {
        pluginName: 'jira',
        connectionId: 1,
        scopes: [{ scopeId: '1001' }],
      },
    ]);
  });

  it('onboard blueprint update payload rejects a scope without the plugin scope ID', () => {
    expect(() => buildOnboardBlueprintUpdatePayload('github', 1, [{ data: {} }])).toThrow(/Missing scope ID field/);
  });

  describe('toSyncLog', () => {
    const detail = (over: Record<string, unknown>) => ({
      sequence: 1,
      name: 'Collect Issues',
      isCollector: true,
      isFailed: false,
      beganAt: null,
      finishedAt: null,
      finishedRecords: 0,
      ...over,
    });

    it('returns an empty log for a missing task', () => {
      expect(toSyncLog(undefined, COPY.result.collectGit)).toStrictEqual({
        plugin: undefined,
        name: 'Collect Git entities in Unknown',
        percent: 0,
        tasks: [],
      });
    });

    it('keeps collectors only and derives status and percent', () => {
      const task = {
        plugin: 'github',
        options: { fullName: 'org/repo' },
        subtaskDetails: [
          detail({ sequence: 1, name: 'a', beganAt: 'x', finishedAt: 'y', finishedRecords: 5 }),
          detail({ sequence: 2, name: 'b', beganAt: 'x' }),
          detail({ sequence: 3, name: 'c', isFailed: true }),
          detail({ sequence: 4, name: 'd' }),
          detail({ sequence: 5, name: 'e', isCollector: false }),
        ],
      };

      const log = toSyncLog(task as never, COPY.result.collectNonGit);

      expect(log.name).toBe('Collect non-Git entities in org/repo');
      expect(log.percent).toBe(50);
      expect(log.tasks.map((it) => it.status)).toStrictEqual([
        LOG_STATUS.SUCCESS,
        LOG_STATUS.RUNNING,
        LOG_STATUS.FAILED,
        LOG_STATUS.PENDING,
      ]);
    });
  });

  describe('getLogStatusText', () => {
    it('shows pending for a task that has not begun', () => {
      expect(getLogStatusText({ step: 1, name: 'x', status: LOG_STATUS.PENDING, finishedRecords: 0 })).toBe('Pending');
    });

    it('maps the clone task to its own states', () => {
      const base = { step: 1, name: 'Clone Git Repo', finishedRecords: 0 };

      expect(getLogStatusText({ ...base, status: LOG_STATUS.RUNNING })).toBe(COPY.logs.notAvailable);
      expect(getLogStatusText({ ...base, status: LOG_STATUS.SUCCESS })).toBe(COPY.logs.completed);
      expect(getLogStatusText({ ...base, status: LOG_STATUS.FAILED })).toBe(COPY.logs.failed);
    });

    it('shows the record count for other tasks', () => {
      expect(getLogStatusText({ step: 2, name: 'Issues', status: LOG_STATUS.SUCCESS, finishedRecords: 7 })).toBe(
        'Records collected: 7',
      );
    });
  });

  describe('getCompletionPercent', () => {
    it('floors the completion rate to a percent and defaults to zero', () => {
      expect(getCompletionPercent(0.756)).toBe(75);
      expect(getCompletionPercent(1)).toBe(100);
      expect(getCompletionPercent()).toBe(0);
    });
  });
});
