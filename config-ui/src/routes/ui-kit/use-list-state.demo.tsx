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

import { Button, Input, Space } from 'antd';
import { useState } from 'react';

import { SORT_ORDER, useListState } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { LIST_DEFAULTS } from './fixtures';
import { Mono } from './styled';

const NEXT_PAGE_SIZE = 50;

export const UseListStateDemo = () => {
  const list = useListState<string, { status: string }>(LIST_DEFAULTS);
  const [draft, setDraft] = useState('');
  const { setPage, setPageSize, setKeyword, setFilter, setSort, reset, toQuery, ...state } = list;
  const text = COPY.useListState;
  return (
    <DemoSection id={SECTION.USE_LIST_STATE} title={COPY.sections.useListState}>
      <DemoCase label={text.note}>
        <Space wrap>
          <Input value={draft} onChange={(event) => setDraft(event.target.value)} aria-label={text.keyword} />
          <Button onClick={() => setKeyword(draft)}>{text.setKeyword}</Button>
          <Button onClick={() => setPage(state.page + 1)}>{text.nextPage}</Button>
          <Button onClick={() => setPageSize(NEXT_PAGE_SIZE)}>{text.setSize}</Button>
          <Button onClick={() => setFilter('status', 'failed')}>{text.filter}</Button>
          <Button onClick={() => setSort({ sortBy: 'status', sortOrder: SORT_ORDER.DESC })}>{text.sort}</Button>
          <Button danger onClick={reset}>
            {text.reset}
          </Button>
        </Space>
      </DemoCase>
      <DemoCase label={text.state}>
        <Mono>{JSON.stringify(state, null, 2)}</Mono>
      </DemoCase>
      <DemoCase label={text.query}>
        <Mono>{JSON.stringify(toQuery(), null, 2)}</Mono>
      </DemoCase>
    </DemoSection>
  );
};
