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

import { Progress, type ProgressProps } from 'antd';

import { COPY, PERCENT_MAX, PIPELINE_PROGRESS_STATUS, PROGRESS_STROKE } from './constants';
import { Bar, Cell, Percent } from './styled';
import type { PipelineProgressProps, PipelineProgressStatus } from './types';

const ANTD_STATUS: Record<PipelineProgressStatus, ProgressProps['status']> = {
  [PIPELINE_PROGRESS_STATUS.PENDING]: 'normal',
  [PIPELINE_PROGRESS_STATUS.RUNNING]: 'active',
  [PIPELINE_PROGRESS_STATUS.COMPLETED]: 'success',
  [PIPELINE_PROGRESS_STATUS.FAILED]: 'exception',
};

export const PipelineProgress = ({ status, finished, total }: PipelineProgressProps) => {
  const percent = total > 0 ? Math.min(PERCENT_MAX, Math.round((finished / total) * PERCENT_MAX)) : 0;
  return (
    <Cell>
      <Bar>
        <Progress
          percent={percent}
          status={ANTD_STATUS[status]}
          showInfo={false}
          size={{ height: PROGRESS_STROKE }}
          aria-label={COPY.summary(finished, total)}
        />
      </Bar>
      <Percent>{percent}%</Percent>
    </Cell>
  );
};
