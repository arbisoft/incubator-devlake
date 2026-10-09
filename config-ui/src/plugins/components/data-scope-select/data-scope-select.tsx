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

import { PlusOutlined, RedoOutlined } from '@ant-design/icons';
import { Button, Checkbox, Select } from 'antd';

import { Loading, Block, Message } from '@/components';
import { PATHS } from '@/config';
import { ExternalLink } from '@/ui';

import { ScopePanes } from '../data-scope-remote';

import { COPY } from './constants';
import { Actions, Notice, Row, Stack } from './styled';
import type { DataScopeSelectProps } from './types';
import { useDataScopeSelect } from './use-data-scope-select';

export const DataScopeSelect = ({
  plugin,
  connectionId,
  showWarning = false,
  initialScope,
  onSubmit,
  onCancel,
}: DataScopeSelectProps) => {
  const { list, search, selectedIds, selectedOptions, selectingAll, allSelected, partialSelected, ...actions } =
    useDataScopeSelect({ plugin, connectionId, initialScope, onSubmit });
  const connectionPath = PATHS.CONNECTION(plugin, connectionId);
  const hasItems = list.items.length > 0;

  const description = hasItems ? (
    <>
      {COPY.description.intro} <ExternalLink href={connectionPath}>{COPY.description.link}</ExternalLink>.
    </>
  ) : (
    <>
      {COPY.description.emptyIntro} <ExternalLink href={connectionPath}>{COPY.description.emptyLink}</ExternalLink>{' '}
      {COPY.description.emptyOutro}
    </>
  );

  const renderBody = () => {
    if (list.loading) return <Loading />;

    if (!hasItems) {
      return (
        <Button type="primary" icon={<PlusOutlined />} href={connectionPath} target="_blank" rel="noreferrer">
          {COPY.add}
        </Button>
      );
    }

    return (
      <Stack>
        {showWarning ? (
          <Notice>
            <Message
              content={
                <>
                  {COPY.warning.intro} <ExternalLink href={connectionPath}>{COPY.description.link}</ExternalLink>.
                </>
              }
            />
          </Notice>
        ) : (
          <div>
            <Button type="primary" icon={<RedoOutlined />} disabled={selectingAll} onClick={list.refresh}>
              {COPY.refresh}
            </Button>
          </div>
        )}
        <Row>
          <Checkbox
            checked={allSelected}
            indeterminate={partialSelected}
            disabled={selectingAll}
            onChange={(e) => actions.changeSelectAll(e.target.checked)}
          >
            {COPY.selectAll(list.total)}
          </Checkbox>
          {selectingAll && <span>{COPY.loadingAll}</span>}
        </Row>
        <Select
          disabled={selectingAll}
          filterOption={false}
          loading={search.searching}
          placeholder={COPY.searchPlaceholder}
          showSearch
          options={search.options}
          searchValue={search.query}
          value={null}
          onChange={actions.addSearchScope}
          onSearch={search.setQuery}
        />
        <Select
          allowClear
          disabled={selectingAll}
          mode="multiple"
          open={false}
          placeholder={COPY.selectedPlaceholder}
          suffixIcon={null}
          options={selectedOptions}
          value={selectedIds}
          onChange={actions.setSelectedIds}
        />
        <ScopePanes
          key={list.listKey}
          compact
          columnCount={1}
          items={list.items}
          getHasMore={() => list.items.length < list.total}
          onScroll={list.loadMore}
          selectedIds={selectedIds}
          onSelectItemIds={actions.changeSelection}
        />
        <Actions>
          <Button onClick={onCancel}>{COPY.cancel}</Button>
          <Button
            type="primary"
            disabled={!selectedIds.length || selectingAll}
            loading={selectingAll}
            onClick={actions.submit}
          >
            {COPY.save}
          </Button>
        </Actions>
      </Stack>
    );
  };

  return (
    <Block title={COPY.title} description={description} required>
      {renderBody()}
    </Block>
  );
};
