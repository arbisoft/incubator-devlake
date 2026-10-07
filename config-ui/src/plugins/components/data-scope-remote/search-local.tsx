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

import { SearchOutlined } from '@ant-design/icons';
import { useDebounce } from 'ahooks';
import { Button, Input, Modal } from 'antd';
import type { McsItem } from 'miller-columns-select';
import { useState, useEffect, useEffectEvent, useMemo, useRef } from 'react';

import { Loading, Block, Message } from '@/components';

import { COPY, LOAD_STATUS, LOADING_ICON_SIZE, ROOT_COLUMN_ID, SCOPE_ITEM_TYPE, SEARCH_DEBOUNCE_MS } from './constants';
import { loadChildren } from './load-children';
import { ScopePanes } from './scope-panes';
import { SelectedScopes } from './selected-scopes';
import { JobLoad, Stack, SuccessIcon } from './styled';
import type { LoadStatus, ResItem, SearchProps } from './types';
import { toBrowseProps, toSelectionProps } from './utils';

type MillerState = {
  items: McsItem<ResItem>[];
  loadedIds: ID[];
  expandedIds: ID[];
  errorId?: ID | null;
  nextTokenMap: Record<ID, string>;
};

type GetItemsParams = { groupId: ID | null; currentPageToken?: string; loadAll?: boolean };

export const SearchLocal = ({
  mode,
  plugin,
  connectionId,
  config,
  disabledScope,
  selectedScope,
  onChange,
}: SearchProps) => {
  const [miller, setMiller] = useState<MillerState>({ items: [], loadedIds: [], expandedIds: [], nextTokenMap: {} });
  const [open, setOpen] = useState(false);
  const [jobStatus, setJobStatus] = useState<LoadStatus>(LOAD_STATUS.INIT);
  const [query, setQuery] = useState('');
  const canceling = useRef(false);
  const search = useDebounce(query, { wait: SEARCH_DEBOUNCE_MS });

  const scopes = useMemo(
    () =>
      search
        ? miller.items
            .filter((it) => it.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
            .filter((it) => it.type !== SCOPE_ITEM_TYPE.GROUP)
            .map((it) => ({
              ...it,
              parentId: null,
            }))
        : miller.items,
    [search, miller.items],
  );

  const getItems = async ({ groupId, currentPageToken, loadAll }: GetItemsParams) => {
    if (canceling.current) {
      canceling.current = false;
      setJobStatus(LOAD_STATUS.INIT);
      return;
    }

    const {
      items: newItems,
      nextPageToken,
      failed,
    } = await loadChildren({
      plugin,
      connectionId,
      groupId,
      pageToken: currentPageToken,
      toTitle: (it) => it.name,
    });
    const errorId = failed ? groupId : undefined;

    if (nextPageToken) {
      setMiller((m) => ({
        ...m,
        items: [...m.items, ...newItems],
        expandedIds: [...m.expandedIds, groupId ?? ROOT_COLUMN_ID],
        nextTokenMap: {
          ...m.nextTokenMap,
          [groupId ?? ROOT_COLUMN_ID]: nextPageToken,
        },
      }));

      if (loadAll) {
        await getItems({ groupId, currentPageToken: nextPageToken, loadAll });
      }
    } else {
      setMiller((m) => ({
        ...m,
        items: [...m.items, ...newItems],
        expandedIds: [...m.expandedIds, groupId ?? ROOT_COLUMN_ID],
        loadedIds: [...m.loadedIds, groupId ?? ROOT_COLUMN_ID],
        errorId,
      }));

      const groupItems = newItems.filter((it) => it.type === SCOPE_ITEM_TYPE.GROUP);

      if (loadAll && groupItems.length) {
        groupItems.forEach(async (it) => await getItems({ groupId: it.id, loadAll: true }));
      }
    }
  };

  const loadRoot = useEffectEvent(() => getItems({ groupId: null }));

  useEffect(() => {
    loadRoot();
  }, []);

  const searchPlaceholder = config.searchPlaceholder ?? COPY.searchFallback;
  const browseProps = toBrowseProps(miller, config);
  const selectionProps = toSelectionProps(disabledScope, selectedScope, miller.items, onChange);
  const allLoaded =
    miller.items.length > 0 &&
    !miller.items.some((it) => it.type === SCOPE_ITEM_TYPE.GROUP && !miller.loadedIds.includes(it.id));
  const status = allLoaded ? LOAD_STATUS.LOADED : jobStatus;

  const handleLoadAllScopes = async () => {
    setOpen(false);
    setJobStatus(LOAD_STATUS.LOADING);

    if (!miller.loadedIds.includes(ROOT_COLUMN_ID)) {
      await getItems({
        groupId: null,
        currentPageToken: miller.nextTokenMap[ROOT_COLUMN_ID],
        loadAll: true,
      });
    }

    const noLoadedItems = miller.items.filter(
      (it) => it.type === SCOPE_ITEM_TYPE.GROUP && !miller.loadedIds.includes(it.id),
    );
    noLoadedItems.forEach(async (it) => {
      await getItems({
        groupId: it.id,
        currentPageToken: miller.nextTokenMap[it.id],
        loadAll: true,
      });
    });
  };

  const handleCancelLoadAllScopes = () => {
    setJobStatus(LOAD_STATUS.CANCEL);
    canceling.current = true;
  };

  return (
    <Block title={config.title} required>
      <Stack>
        {(status === LOAD_STATUS.LOADING || status === LOAD_STATUS.CANCEL) && (
          <JobLoad>
            <Loading size={LOADING_ICON_SIZE} />
            {COPY.loadingScopes} <span className="count">{miller.items.length}</span> {COPY.scopesFound}
            <Button loading={status === LOAD_STATUS.CANCEL} onClick={handleCancelLoadAllScopes}>
              {COPY.cancel}
            </Button>
          </JobLoad>
        )}

        {status === LOAD_STATUS.LOADED && (
          <JobLoad>
            <SuccessIcon />
            <span className="count">{miller.items.length}</span> {COPY.scopesFound}
          </JobLoad>
        )}

        {status === LOAD_STATUS.INIT && (
          <JobLoad>
            <Button type="primary" disabled={!miller.items.length} onClick={() => setOpen(true)}>
              {COPY.loadAll}
            </Button>
          </JobLoad>
        )}

        {status === LOAD_STATUS.LOADED && (
          <Input
            prefix={<SearchOutlined />}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        <ScopePanes<ResItem>
          mode={mode}
          items={scopes}
          {...browseProps}
          {...selectionProps}
          columnCount={search ? 1 : browseProps.columnCount}
          onExpand={(id) => getItems({ groupId: id })}
          onScroll={(id) => getItems({ groupId: id, currentPageToken: miller.nextTokenMap[id ?? ROOT_COLUMN_ID] })}
          expandedIds={miller.expandedIds}
        />
        <SelectedScopes plugin={plugin} scopes={selectedScope} onChange={onChange} />
      </Stack>
      <Modal open={open} centered onOk={handleLoadAllScopes} onCancel={() => setOpen(false)}>
        <Message content={COPY.loadAllWarning(config.title)} />
      </Modal>
    </Block>
  );
};
