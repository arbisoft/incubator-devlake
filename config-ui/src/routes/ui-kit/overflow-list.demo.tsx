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

import { OverflowList } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { Narrow } from './styled';

const { overflowList: text } = COPY;
const toItems = (names: string[]) => names.map((name) => ({ key: name, node: name }));
const MAX_VISIBLE = 2;

export const OverflowListDemo = () => (
  <DemoSection id={SECTION.OVERFLOW_LIST} title={COPY.sections.overflowList}>
    <DemoCase label={COPY.cases.default}>
      <OverflowList items={toItems(text.items.slice(0, MAX_VISIBLE))} max={MAX_VISIBLE} moreLabel={text.more} />
    </DemoCase>
    <DemoCase label={COPY.cases.manyItems}>
      <OverflowList items={toItems(text.items)} max={MAX_VISIBLE} moreLabel={text.more} />
    </DemoCase>
    <DemoCase label={COPY.cases.longText}>
      <Narrow>
        <OverflowList items={toItems([text.longItem, ...text.items])} max={MAX_VISIBLE} moreLabel={text.more} />
      </Narrow>
    </DemoCase>
  </DemoSection>
);
