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

import { EMPTY_STATE_SIZE, EmptyState, SectionCard } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { Narrow } from './styled';

const { sectionCard: text } = COPY;

export const SectionCardDemo = () => (
  <DemoSection id={SECTION.SECTION_CARD} title={COPY.sections.sectionCard}>
    <DemoCase label={COPY.cases.default}>
      <SectionCard title={text.title}>{text.body}</SectionCard>
    </DemoCase>
    <DemoCase label={`${COPY.cases.withValue}, ${COPY.cases.withAction}`}>
      <SectionCard title={text.title} count={2} description={text.description} actions={<Button>{text.action}</Button>}>
        {text.body}
      </SectionCard>
    </DemoCase>
    <DemoCase label={COPY.cases.empty}>
      <SectionCard title={text.title} count={0}>
        <EmptyState title={text.emptyTitle} description={text.emptyDescription} size={EMPTY_STATE_SIZE.SECTION} />
      </SectionCard>
    </DemoCase>
    <DemoCase label={COPY.cases.longText}>
      <Narrow>
        <SectionCard
          title={text.longTitle}
          count={12}
          description={text.description}
          actions={<Button>{text.action}</Button>}
        >
          {text.body}
        </SectionCard>
      </Narrow>
    </DemoCase>
  </DemoSection>
);
