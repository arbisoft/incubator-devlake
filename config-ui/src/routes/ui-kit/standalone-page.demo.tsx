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

import { EMPTY_ILLUSTRATION, EMPTY_STATE_SIZE, EmptyState, StandalonePage } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';

const { emptyState: text } = COPY;

export const StandalonePageDemo = () => (
  <DemoSection id={SECTION.STANDALONE_PAGE} title={COPY.sections.standalonePage}>
    <DemoCase label={`${COPY.cases.page}, ${COPY.cases.withAction}`}>
      <StandalonePage>
        <EmptyState
          illustration={EMPTY_ILLUSTRATION.EMPTY}
          title={text.emptyTitle}
          description={text.emptyDescription}
          action={<Button type="primary">{text.add}</Button>}
          size={EMPTY_STATE_SIZE.PAGE}
        />
      </StandalonePage>
    </DemoCase>
  </DemoSection>
);
