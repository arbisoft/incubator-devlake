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

import { StopOutlined, RedoOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useState } from 'react';

import API from '@/api';
import { Loading } from '@/components';
import { useAutoRefresh } from '@/hooks';
import { IPipeline, IPipelineStatus } from '@/types';
import { formatTime, operator } from '@/utils';

import { COPY } from '../constants';
import * as S from '../styled';

import { PipelineDuration } from './duration';
import { PipelineStatusBadge } from './status-badge';

interface Props {
  id: ID;
}

export const PipelineInfo = ({ id }: Props) => {
  const [operating, setOperating] = useState(false);

  const { data } = useAutoRefresh<IPipeline>(() => API.pipeline.get(id), [], {
    cancel: (data) => {
      return !!(
        data &&
        [
          IPipelineStatus.COMPLETED,
          IPipelineStatus.PARTIAL,
          IPipelineStatus.FAILED,
          IPipelineStatus.CANCELLED,
        ].includes(data.status)
      );
    },
  });

  const handleCancel = async () => {
    await operator(() => API.pipeline.remove(id), { setOperating });
  };

  const handleRerun = async () => {
    await operator(() => API.pipeline.rerun(id), { setOperating });
  };

  if (!data) {
    return <Loading />;
  }

  const { status, beganAt, finishedAt, stage, finishedTasks, totalTasks } = data;

  return (
    <S.Info>
      <ul>
        <li>
          <span>{COPY.info.status}</span>
          <strong>
            <PipelineStatusBadge status={status} />
          </strong>
        </li>
        <li>
          <span>{COPY.info.startedAt}</span>
          <strong>{formatTime(beganAt)}</strong>
        </li>
        <li>
          <span>{COPY.info.duration}</span>
          <strong>
            <PipelineDuration status={status} beganAt={beganAt} finishedAt={finishedAt} />
          </strong>
        </li>
        <li>
          <span>{COPY.info.stage}</span>
          <strong>{stage}</strong>
        </li>
        <li>
          <span>{COPY.info.tasksCompleted}</span>
          <strong>
            {finishedTasks}/{totalTasks}
          </strong>
        </li>
        <li>
          {[IPipelineStatus.ACTIVE, IPipelineStatus.RUNNING, IPipelineStatus.RERUN].includes(status) && (
            <Tooltip title={COPY.info.cancel}>
              <Button
                loading={operating}
                icon={<StopOutlined />}
                aria-label={COPY.info.cancel}
                onClick={handleCancel}
              />
            </Tooltip>
          )}
          {[
            IPipelineStatus.COMPLETED,
            IPipelineStatus.PARTIAL,
            IPipelineStatus.FAILED,
            IPipelineStatus.CANCELLED,
          ].includes(status) && (
            <Tooltip title={COPY.info.rerun}>
              <Button loading={operating} icon={<RedoOutlined />} aria-label={COPY.info.rerun} onClick={handleRerun} />
            </Tooltip>
          )}
        </li>
      </ul>
      {IPipelineStatus.FAILED === status && <p className="message">{COPY.info.failed}</p>}
    </S.Info>
  );
};
