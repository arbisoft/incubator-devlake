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

import { IPipelineStatus } from '@/types';

import { COPY, STAGE_STATE } from '../constants';
import { getStageTimes, STAGE_STATE_STATUS } from '../utils';

import { PipelineDuration } from './duration';
import {
  Stage,
  StageDot,
  StageHeader,
  StageMeta,
  StageName,
  StageNote,
  StageLabel,
  StageTitle,
  TaskList,
} from './styled';
import { PipelineTask } from './task';
import type { PipelineStageProps } from './types';

export const PipelineStageCard = ({ stage, onChanged }: PipelineStageProps) => {
  const { key, tasks, state } = stage;
  const failed = tasks.filter((task) => task.status === IPipelineStatus.FAILED).length;
  const { beganAt, finishedAt } = getStageTimes(tasks);

  return (
    <Stage $state={state}>
      <StageHeader>
        <StageTitle>
          <StageDot $state={state} aria-hidden />
          <StageName>{COPY.stage.label(key)}</StageName>
          {state === STAGE_STATE.ERROR && <StageNote>{COPY.stage.failedCount(failed, tasks.length)}</StageNote>}
        </StageTitle>
        <StageMeta>
          <PipelineDuration status={STAGE_STATE_STATUS[state]} beganAt={beganAt} finishedAt={finishedAt} />
          <StageLabel $state={state}>{COPY.stage.state[state]}</StageLabel>
        </StageMeta>
      </StageHeader>
      <TaskList>
        {tasks.map((task) => (
          <PipelineTask key={task.id} task={task} onChanged={onChanged} />
        ))}
      </TaskList>
    </Stage>
  );
};
