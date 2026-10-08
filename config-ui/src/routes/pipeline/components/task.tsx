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

import { ReloadOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useState } from 'react';

import API from '@/api';
import { TextTooltip } from '@/components';
import { getPluginConfig } from '@/plugins';
import { IconButton, PipelineProgress } from '@/ui';
import { toUserMessage } from '@/ui/utils';
import { operator } from '@/utils';

import { COPY, TASK_CELL } from '../constants';
import { PIPELINE_PROGRESS_STATUS_MAP } from '../status-tone';
import { getTaskName } from '../task-name';
import { canRerunTask, getStageState, getTaskCell } from '../utils';

import { PipelineDuration } from './duration';
import { Task, TaskAction, TaskCell, TaskFailed, TaskId, TaskName, TaskTime } from './styled';
import type { PipelineTaskProps } from './types';

const INACTIVE_CELLS: string[] = [TASK_CELL.PENDING, TASK_CELL.CANCELLED];

export const PipelineTask = ({ task, onChanged }: PipelineTaskProps) => {
  const [operating, setOperating] = useState(false);
  const { id, plugin, options, status, beganAt, finishedAt, errorName } = task;
  const config = getPluginConfig(plugin);
  const name = getTaskName(config.plugin, config.name, options);
  const cell = getTaskCell(task);

  const handleRerun = async () => {
    const [success] = await operator(() => API.task.rertun(id), {
      setOperating,
      formatMessage: () => COPY.actions.taskRerunStarted,
      formatReason: (error) => toUserMessage(error, {}, COPY.actions.taskRerunFailed),
    });
    if (success) onChanged();
  };

  return (
    <Task $state={getStageState([task])} $inactive={INACTIVE_CELLS.includes(cell.kind)}>
      <TaskId>{COPY.task.label(id)}</TaskId>
      <TaskName>
        <TextTooltip content={name}>{name}</TextTooltip>
      </TaskName>
      <TaskTime>
        <PipelineDuration status={status} beganAt={beganAt} finishedAt={finishedAt} />
      </TaskTime>
      <TaskCell>
        {cell.kind === TASK_CELL.PROGRESS && (
          <Tooltip title={cell.counted ? COPY.task.subtasks(cell.finished, cell.total) : undefined}>
            <div>
              <PipelineProgress
                status={PIPELINE_PROGRESS_STATUS_MAP[status]}
                finished={cell.finished}
                total={cell.total}
              />
            </div>
          </Tooltip>
        )}
        {cell.kind === TASK_CELL.PENDING && COPY.task.pending}
        {cell.kind === TASK_CELL.CANCELLED && COPY.task.cancelled}
        {cell.kind === TASK_CELL.FAILED && (
          <Tooltip title={errorName}>
            <TaskFailed>{COPY.task.failed}</TaskFailed>
          </Tooltip>
        )}
      </TaskCell>
      <TaskAction>
        {canRerunTask(status) && (
          <IconButton icon={<ReloadOutlined />} label={COPY.task.rerun} loading={operating} onClick={handleRerun} />
        )}
      </TaskAction>
    </Task>
  );
};
