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

import { EMPTY_ILLUSTRATION, EMPTY_STATE_SIZE, EmptyState } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { Framed, Row } from './styled';

const { emptyState: text } = COPY;

export const EmptyStateDemo = () => (
  <DemoSection id={SECTION.EMPTY_STATE} title={COPY.sections.emptyState}>
    <DemoCase label={COPY.cases.illustrations}>
      <Row>
        <Framed>
          <EmptyState
            illustration={EMPTY_ILLUSTRATION.EMPTY}
            title={text.emptyTitle}
            description={text.emptyDescription}
            size={EMPTY_STATE_SIZE.SECTION}
          />
        </Framed>
        <Framed>
          <EmptyState
            illustration={EMPTY_ILLUSTRATION.NO_USERS}
            title={text.usersTitle}
            description={text.usersDescription}
            size={EMPTY_STATE_SIZE.SECTION}
          />
        </Framed>
        <Framed>
          <EmptyState
            illustration={EMPTY_ILLUSTRATION.NO_CONNECTION}
            title={text.connectionTitle}
            description={text.connectionDescription}
            size={EMPTY_STATE_SIZE.SECTION}
          />
        </Framed>
      </Row>
    </DemoCase>
    <DemoCase label={`${COPY.cases.error}, ${COPY.cases.withAction}, ${COPY.cases.page}`}>
      <Framed>
        <EmptyState
          illustration={EMPTY_ILLUSTRATION.ERROR}
          title={text.errorTitle}
          description={text.errorDescription}
          action={<Button type="primary">{text.retry}</Button>}
          size={EMPTY_STATE_SIZE.PAGE}
        />
      </Framed>
    </DemoCase>
    <DemoCase label={`${COPY.cases.noIllustration}, ${COPY.cases.section}`}>
      <Framed>
        <EmptyState title={text.emptyTitle} action={<Button>{text.add}</Button>} size={EMPTY_STATE_SIZE.SECTION} />
      </Framed>
    </DemoCase>
    <DemoCase label={COPY.cases.longText}>
      <Framed>
        <EmptyState
          illustration={EMPTY_ILLUSTRATION.EMPTY}
          title={text.longTitle}
          description={text.longDescription}
          size={EMPTY_STATE_SIZE.SECTION}
        />
      </Framed>
    </DemoCase>
  </DemoSection>
);
