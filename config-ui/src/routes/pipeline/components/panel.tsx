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

import API from '@/api';
import { Loading } from '@/components';
import { useAutoRefresh } from '@/hooks';
import type { IPipeline, ITask } from '@/types';
import { useRefreshVersion } from '@/ui';

import { COPY } from '../constants';
import { areTasksSettled, isPipelineFinished } from '../utils';

import { PipelineStages } from './stages';
import { Panel, PanelLoading } from './styled';
import { PipelineSummary } from './summary';
import type { PipelinePanelProps } from './types';

export const PipelinePanel = ({ id }: PipelinePanelProps) => {
  const { version, refresh } = useRefreshVersion();

  const { data: pipeline } = useAutoRefresh<IPipeline>(() => API.pipeline.get(id), [id, version], {
    cancel: (data) => !!data && isPipelineFinished(data.status),
  });
  const { data: tasks } = useAutoRefresh<ITask[]>(async () => (await API.pipeline.tasks(id)).tasks, [id, version], {
    cancel: (data) => !!data && areTasksSettled(data),
  });

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
