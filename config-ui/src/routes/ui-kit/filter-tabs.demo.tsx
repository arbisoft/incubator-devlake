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

import { useState } from 'react';

import { FILTER_TABS_VARIANT, FilterTabs } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { FILTER_ITEMS, FILTER_ITEMS_MANY, FILTER_ITEMS_PLAIN } from './fixtures';
import { Narrow } from './styled';

export const FilterTabsDemo = () => {
  const [pill, setPill] = useState(FILTER_ITEMS[0].key);
  const [flat, setFlat] = useState(FILTER_ITEMS[0].key);
  const [plain, setPlain] = useState(FILTER_ITEMS_PLAIN[0].key);
  const [many, setMany] = useState(FILTER_ITEMS_MANY[0].key);
  return (
    <DemoSection id={SECTION.FILTER_TABS} title={COPY.sections.filterTabs}>
      <DemoCase label={`${COPY.cases.pill}, ${COPY.cases.withCounts}`}>
        <FilterTabs items={FILTER_ITEMS} value={pill} onChange={setPill} variant={FILTER_TABS_VARIANT.PILL} />
        <span role="status">{COPY.filterTabs.selected(pill)}</span>
      </DemoCase>
      <DemoCase label={`${COPY.cases.flat}, ${COPY.cases.withCounts}`}>
        <FilterTabs items={FILTER_ITEMS} value={flat} onChange={setFlat} variant={FILTER_TABS_VARIANT.FLAT} />
      </DemoCase>
      <DemoCase label={`${COPY.cases.pill}, ${COPY.cases.default}`}>
        <FilterTabs items={FILTER_ITEMS_PLAIN} value={plain} onChange={setPlain} variant={FILTER_TABS_VARIANT.PILL} />
      </DemoCase>
      <DemoCase label={`${COPY.cases.flat}, ${COPY.cases.manyItems}`}>
        <Narrow>
          <FilterTabs items={FILTER_ITEMS_MANY} value={many} onChange={setMany} variant={FILTER_TABS_VARIANT.FLAT} />
        </Narrow>
      </DemoCase>
    </DemoSection>
  );
};
