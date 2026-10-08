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

import { BrandBlock, PoweredByRow } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { DarkBox, Row } from './styled';

export const BrandBlockDemo = () => (
  <DemoSection id={SECTION.BRAND_BLOCK} title={COPY.sections.brandBlock}>
    <DemoCase label={`${COPY.cases.expanded}. ${COPY.brandBlock.note}`}>
      <DarkBox $wide>
        <BrandBlock collapsed={false} />
      </DarkBox>
    </DemoCase>
    <DemoCase label={COPY.cases.collapsed}>
      <Row>
        <DarkBox>
          <BrandBlock collapsed />
        </DarkBox>
      </Row>
    </DemoCase>
    <DemoCase label={COPY.cases.poweredBy}>
      <DarkBox $wide>
        <PoweredByRow />
      </DarkBox>
    </DemoCase>
    <DemoCase label={COPY.cases.customTitle}>
      <Row>
        <DarkBox $wide>
          <BrandBlock collapsed={false} title={COPY.brandBlock.customTitle} />
        </DarkBox>
        <DarkBox>
          <BrandBlock collapsed title={COPY.brandBlock.customTitle} />
        </DarkBox>
      </Row>
    </DemoCase>
  </DemoSection>
);
