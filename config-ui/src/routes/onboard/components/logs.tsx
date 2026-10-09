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

import { LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { Tooltip, Progress } from 'antd';

import { STATUS_TONE } from '@/ui/constants';

import { COPY, LOG_STATUS } from '../constants';
import type { SyncLog } from '../types';
import { getLogStatusText } from '../utils';

import {
  Log,
  LogName,
  LogProgress,
  LogTask,
  LogTaskIcon,
  LogTaskName,
  LogTaskStatus,
  LogTasks,
  LogTitle,
} from './styled';

const STATUS_ICON = {
  [LOG_STATUS.RUNNING]: { icon: <LoadingOutlined />, tone: STATUS_TONE.INFO },
  [LOG_STATUS.SUCCESS]: { icon: <CheckCircleOutlined />, tone: STATUS_TONE.SUCCESS },
  [LOG_STATUS.FAILED]: { icon: <CloseCircleOutlined />, tone: STATUS_TONE.ERROR },
};

type LogsProps = { log: SyncLog };

export const Logs = ({ log: { plugin, name, percent, tasks } }: LogsProps) => {
  if (!plugin) {
    return null;
  }

  return (
    <Log>
      <LogTitle>
        <Tooltip title={name}>
          <LogName>{name}</LogName>
        </Tooltip>
        <LogProgress>
          <Progress size="small" percent={percent} showInfo={false} />
        </LogProgress>
      </LogTitle>
      <LogTasks>
        {tasks.map((task) => {
          const indicator = task.status === LOG_STATUS.PENDING ? undefined : STATUS_ICON[task.status];
          return (
            <LogTask key={`${task.step}-${task.name}`}>
              <LogTaskName>{COPY.logs.stepLabel(task.step, task.name)}</LogTaskName>
              <LogTaskStatus>{getLogStatusText(task)}</LogTaskStatus>
              {indicator && <LogTaskIcon $tone={indicator.tone}>{indicator.icon}</LogTaskIcon>}
            </LogTask>
          );
        })}
      </LogTasks>
    </Log>
  );
};
