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

import { useRef } from 'react';

import { useInView } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { ScrollBox, Spacer, Target } from './styled';

type ProbeProps = { once: boolean };

const Probe = ({ once }: ProbeProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once });
  return (
    <ScrollBox>
      <Spacer>{COPY.useInView.scroll}</Spacer>
      <Target ref={ref} role="status">
        {inView ? COPY.useInView.inView : COPY.useInView.outOfView}
      </Target>
      <Spacer />
    </ScrollBox>
  );
};

export const UseInViewDemo = () => (
  <DemoSection id={SECTION.USE_IN_VIEW} title={COPY.sections.useInView}>
    <DemoCase label={COPY.useInView.repeat}>
      <Probe once={false} />
    </DemoCase>
    <DemoCase label={COPY.useInView.once}>
      <Probe once />
    </DemoCase>
  </DemoSection>
);
