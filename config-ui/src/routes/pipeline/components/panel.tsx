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

import { Button } from 'antd';

import API from '@/api';
import { Loading } from '@/components';
import { useAutoRefresh } from '@/hooks';
import type { IPipeline, ITask } from '@/types';
import { COMMON_COPY, EMPTY_ILLUSTRATION, EMPTY_STATE_SIZE, EmptyState, useRefreshVersion } from '@/ui';

import { COPY, LOAD_RETRY } from '../constants';
import { areTasksSettled, isPipelineFinished } from '../utils';

import { PipelineStages } from './stages';
import { Panel, PanelLoading } from './styled';
import { PipelineSummary } from './summary';
import type { PipelinePanelProps } from './types';

export const PipelinePanel = ({ id }: PipelinePanelProps) => {
  const { version, refresh } = useRefreshVersion();

  const { data: pipeline, error } = useAutoRefresh<IPipeline>((signal) => API.pipeline.get(id, signal), [id, version], {
    cancel: (data) => !!data && isPipelineFinished(data.status),
    retryOnError: LOAD_RETRY,
  });
  const { data: tasks } = useAutoRefresh<ITask[]>(
    async (signal) => (await API.pipeline.tasks(id, signal)).tasks,
    [id, version],
    {
      cancel: (data) => !!data && areTasksSettled(data),
      retryOnError: LOAD_RETRY,
    },
  );

  if (!pipeline && error !== undefined) {
    return (
      <EmptyState
        illustration={EMPTY_ILLUSTRATION.ERROR}
        size={EMPTY_STATE_SIZE.SECTION}
        title={COPY.loadFailed}
        action={<Button onClick={refresh}>{COMMON_COPY.retry}</Button>}
      />
    );
  }

  if (!pipeline) {
    return (
      <PanelLoading>
        <Loading text={COPY.loading} />
      </PanelLoading>
    );
  }

  return (
    <Panel>
      <PipelineSummary pipeline={pipeline} onChanged={refresh} />
      {tasks && <PipelineStages tasks={tasks} onChanged={refresh} />}
    </Panel>
  );
};
