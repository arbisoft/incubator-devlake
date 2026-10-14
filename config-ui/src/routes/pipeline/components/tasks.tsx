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

import { CheckCircleOutlined, CloseCircleOutlined, StopOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { groupBy, sortBy } from 'lodash';
import { useState } from 'react';

import API from '@/api';
import { Loading } from '@/components';
import { useAutoRefresh } from '@/hooks';
import { ITask, IPipelineStatus } from '@/types';

import { COPY, STAGE_STATE } from '../constants';
import * as S from '../styled';
import type { StageState } from '../types';

import { PipelineTask } from './task';

interface Props {
  id: ID;
}

export const PipelineTasks = ({ id }: Props) => {
  const [isOpen, setIsOpen] = useState(true);

  const { data } = useAutoRefresh<ITask[]>(
    async () => {
      const taskRes = await API.pipeline.tasks(id);
      return taskRes.tasks;
    },
    [],
    {
      cancel: (data) => {
        return !!(
          data &&
          data.every((task) =>
            [IPipelineStatus.COMPLETED, IPipelineStatus.FAILED, IPipelineStatus.CANCELLED].includes(task.status),
          )
        );
      },
    },
  );

  const stages = groupBy(sortBy(data, 'id'), 'pipelineRow');

  const handleToggleOpen = () => setIsOpen(!isOpen);

  return (
    <S.Tasks>
      <div className="inner">
        <S.TasksHeader>
          {Object.keys(stages).map((key) => {
            let status: StageState;

            switch (true) {
              case !!stages[key].find((task) =>
                [IPipelineStatus.ACTIVE, IPipelineStatus.RUNNING].includes(task.status),
              ):
                status = STAGE_STATE.LOADING;
                break;
              case stages[key].every((task) => task.status === IPipelineStatus.COMPLETED):
                status = STAGE_STATE.SUCCESS;
                break;
              case !!stages[key].find((task) => task.status === IPipelineStatus.FAILED):
                status = STAGE_STATE.ERROR;
                break;
              case !!stages[key].find((task) => task.status === IPipelineStatus.CANCELLED):
                status = STAGE_STATE.CANCEL;
                break;
              default:
                status = STAGE_STATE.READY;
                break;
            }

            return (
              <li key={key} className={status}>
                <strong>{COPY.tasks.stage(key)}</strong>
                {status === STAGE_STATE.LOADING && <Loading size={14} />}
                {status === STAGE_STATE.SUCCESS && <CheckCircleOutlined />}
                {status === STAGE_STATE.ERROR && <CloseCircleOutlined />}
                {status === STAGE_STATE.CANCEL && <StopOutlined />}
              </li>
            );
          })}
        </S.TasksHeader>
        <S.TasksList $open={isOpen}>
          {Object.keys(stages).map((key) => (
            <li key={key}>
              {stages[key].map((task) => (
                <PipelineTask key={task.id} task={task} />
              ))}
            </li>
          ))}
        </S.TasksList>
      </div>
      <Tooltip title={COPY.tasks.toggle}>
        <Button
          size="small"
          className="collapse-control"
          aria-label={COPY.tasks.toggle}
          icon={isOpen ? <DownOutlined /> : <UpOutlined />}
          onClick={handleToggleOpen}
        />
      </Tooltip>
    </S.Tasks>
  );
};
