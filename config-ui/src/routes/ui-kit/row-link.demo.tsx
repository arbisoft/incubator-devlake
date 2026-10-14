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

import { RowLink } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { Narrow } from './styled';

const { rowLink: text } = COPY;

export const RowLinkDemo = () => (
  <DemoSection id={SECTION.ROW_LINK} title={COPY.sections.rowLink}>
    <DemoCase label={COPY.cases.default}>
      <RowLink to="/">{text.label}</RowLink>
    </DemoCase>
    <DemoCase label={COPY.cases.longText}>
      <Narrow>
        <RowLink to="/">{text.label.repeat(4)}</RowLink>
      </Narrow>
    </DemoCase>
  </DemoSection>
);
