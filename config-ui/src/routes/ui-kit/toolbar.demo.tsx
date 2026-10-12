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

import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useState } from 'react';

import { FILTER_TABS_VARIANT, FilterTabs, SearchInput, SortSelect, Toolbar } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { FILTER_ITEMS_PLAIN, SORT_OPTIONS } from './fixtures';
import { Narrow } from './styled';

export const ToolbarDemo = () => {
  const [filter, setFilter] = useState(FILTER_ITEMS_PLAIN[0].key);
  const [sort, setSort] = useState(SORT_OPTIONS[0].key);
  const composed = (
    <Toolbar
      start={
        <>
          <SearchInput placeholder={COPY.searchInput.placeholder} onSearch={() => undefined} />
          <FilterTabs
            items={FILTER_ITEMS_PLAIN}
            value={filter}
            onChange={setFilter}
            variant={FILTER_TABS_VARIANT.PILL}
          />
          <SortSelect options={SORT_OPTIONS} value={sort} onChange={setSort} />
        </>
      }
      end={
        <Button type="primary" icon={<PlusOutlined />}>
          {COPY.toolbar.add}
        </Button>
      }
    />
  );
  return (
    <DemoSection id={SECTION.TOOLBAR} title={COPY.sections.toolbar}>
      <DemoCase label={COPY.cases.startOnly}>
        <Toolbar start={<span>{COPY.toolbar.start}</span>} />
      </DemoCase>
      <DemoCase label={COPY.cases.startAndEnd}>
        <Toolbar start={<span>{COPY.toolbar.start}</span>} end={<span>{COPY.toolbar.end}</span>} />
      </DemoCase>
      <DemoCase label={COPY.cases.composed}>{composed}</DemoCase>
      <DemoCase label={COPY.cases.overflow}>
        <Narrow>{composed}</Narrow>
      </DemoCase>
    </DemoSection>
  );
};
