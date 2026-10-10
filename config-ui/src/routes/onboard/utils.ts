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

import dayjs from 'dayjs';

import type { SubTasksRes } from '@/api/pipeline/types';
import { getPluginScopeId } from '@/plugins/scope-id';
import type { BlueprintConnectionPayload } from '@/types/blueprint';
import { formatTime } from '@/utils/time';

import { CLONE_REPO_TASK, COPY, LOG_STATUS } from './constants';
import type { LogStatus, SyncLog, SyncLogTask } from './types';

type SubTask = SubTasksRes['subtasks'][number];
type SubtaskDetail = SubTask['subtaskDetails'][number];

const formatTimeAfter = (now: Date) => {
  const timeAfter = dayjs.utc(now).subtract(14, 'day').startOf('day').toDate();

  return formatTime(timeAfter, 'YYYY-MM-DD[T]HH:mm:ssZ', { utc: true });
};

type ScopePayloadInput = {
  data: Record<string, unknown>;
};

type OnboardBlueprintUpdatePayload = {
  connections: BlueprintConnectionPayload[];
  timeAfter?: string;
};

export const buildOnboardBlueprintUpdatePayload = (
  plugin: string,
  connectionId: string | number,
  scopes: ScopePayloadInput[],
  now = new Date(),
): OnboardBlueprintUpdatePayload => {
  const payload: OnboardBlueprintUpdatePayload = {
    connections: [
      {
        pluginName: plugin,
        connectionId,
        scopes: scopes.map((it) => ({
          scopeId: getPluginScopeId(plugin, it.data),
        })),
      },
    ],
  };

  if (plugin !== 'github') {
    payload.timeAfter = formatTimeAfter(now);
  }

  return payload;
};

const FINISHED_PERCENT = 100;

const getLogStatus = ({ isFailed, beganAt, finishedAt }: SubtaskDetail): LogStatus => {
  if (isFailed) return LOG_STATUS.FAILED;
  if (!beganAt) return LOG_STATUS.PENDING;
  return finishedAt ? LOG_STATUS.SUCCESS : LOG_STATUS.RUNNING;
};

export const toSyncLog = (task: SubTask | undefined, title: (repo: string) => string): SyncLog => {
  const collectors = (task?.subtaskDetails ?? []).filter((it) => it.isCollector);
  const finished = collectors.filter((it) => it.finishedAt || it.isFailed);

  return {
    plugin: task?.plugin,
    name: title(task?.options?.fullName ?? COPY.result.unknownRepo),
    percent: collectors.length ? Math.floor((finished.length / collectors.length) * FINISHED_PERCENT) : 0,
    tasks: collectors.map((it) => ({
      step: it.sequence,
      name: it.name,
      status: getLogStatus(it),
      finishedRecords: it.finishedRecords,
    })),
  };
};

export const getLogStatusText = ({ name, status, finishedRecords }: SyncLogTask) => {
  if (status === LOG_STATUS.PENDING) return COPY.logs.pending;

  if (name === CLONE_REPO_TASK) {
    if (status === LOG_STATUS.RUNNING) return COPY.logs.notAvailable;
    return status === LOG_STATUS.SUCCESS ? COPY.logs.completed : COPY.logs.failed;
  }

  return COPY.logs.records(finishedRecords);
};

export const getCompletionPercent = (completionRate = 0) => Math.floor(completionRate * FINISHED_PERCENT);
