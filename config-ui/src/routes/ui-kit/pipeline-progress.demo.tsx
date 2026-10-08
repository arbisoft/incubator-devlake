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

import { PipelineProgress } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { PIPELINE_CASES } from './fixtures';
import { Narrow } from './styled';

export const PipelineProgressDemo = () => (
  <DemoSection id={SECTION.PIPELINE_PROGRESS} title={COPY.sections.pipelineProgress}>
    {PIPELINE_CASES.map((item) => (
      <DemoCase key={item.status} label={COPY.pipelineProgress.status(item.status)}>
        <Narrow>
          <PipelineProgress {...item} />
        </Narrow>
      </DemoCase>
    ))}
    <DemoCase label={COPY.cases.noData}>
      <Narrow>
        <PipelineProgress status="pending" finished={0} total={0} />
      </Narrow>
    </DemoCase>
    <DemoCase label={COPY.cases.noTotalFinished}>
      <Narrow>
        <PipelineProgress status="completed" finished={0} total={0} />
      </Narrow>
    </DemoCase>
    <DemoCase label={COPY.cases.noTotalRunning}>
      <Narrow>
        <PipelineProgress status="running" finished={0} total={0} />
      </Narrow>
    </DemoCase>
    <DemoCase label={COPY.cases.overshoot}>
      <Narrow>
        <PipelineProgress status="completed" finished={14} total={12} />
      </Narrow>
    </DemoCase>
  </DemoSection>
);
