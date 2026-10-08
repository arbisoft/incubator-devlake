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

import { ReloadOutlined, StopOutlined } from '@ant-design/icons';

import { IPipelineStatus } from '@/types';
import { IconButton } from '@/ui';
import { formatTime } from '@/utils';

import { COPY } from '../constants';
import { usePipelineActions } from '../use-pipeline-actions';
import { getPipelineActions } from '../utils';

import { PipelineDuration } from './duration';
import { PipelineStatusBadge } from './status-badge';
import { FailedNote, Summary, SummaryActions, SummaryCell, SummaryLabel, SummaryValue } from './styled';
import type { PipelineSummaryProps } from './types';

export const PipelineSummary = ({ pipeline, onChanged }: PipelineSummaryProps) => {
  const { id, status, beganAt, finishedAt, stage, finishedTasks, totalTasks } = pipeline;
  const { operating, cancel, rerun } = usePipelineActions(id, onChanged);
  const actions = getPipelineActions(status);

  const cells = [
    { label: COPY.summary.status, value: <PipelineStatusBadge status={status} /> },
    { label: COPY.summary.startedAt, value: formatTime(beganAt) },
    {
      label: COPY.summary.duration,
      value: <PipelineDuration status={status} beganAt={beganAt} finishedAt={finishedAt} />,
    },
    { label: COPY.summary.stage, value: COPY.stage.label(stage) },
    { label: COPY.summary.tasks, value: COPY.summary.tasksValue(finishedTasks, totalTasks) },
  ];

  return (
    <>
      <Summary aria-label={COPY.summary.label}>
        {cells.map(({ label, value }) => (
          <SummaryCell key={label}>
            <SummaryLabel>{label}</SummaryLabel>
            <SummaryValue>{value}</SummaryValue>
          </SummaryCell>
        ))}
        {(actions.cancel || actions.rerun) && (
          <SummaryActions>
            {actions.cancel && (
              <IconButton icon={<StopOutlined />} label={COPY.summary.cancel} loading={operating} onClick={cancel} />
            )}
            {actions.rerun && (
              <IconButton icon={<ReloadOutlined />} label={COPY.summary.rerun} loading={operating} onClick={rerun} />
            )}
          </SummaryActions>
        )}
      </Summary>
      {status === IPipelineStatus.FAILED && <FailedNote>{COPY.summary.failed}</FailedNote>}
    </>
  );
};
