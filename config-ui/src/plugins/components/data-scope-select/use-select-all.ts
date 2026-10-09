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

import { message } from 'antd';
import axios from 'axios';
import { useEffect, useRef, useState } from 'react';

import API from '@/api';
import { toUserMessage } from '@/ui/utils';

import { COPY, LOAD_ALL_PAGE_SIZE } from './constants';
import type { MergeItems, ScopeSelectItem } from './types';
import { toDataScopeItem } from './utils';

type Options = {
  plugin: string;
  connectionId: ID;
  mergeItems: MergeItems;
  setTotal: (total: number) => void;
  setSelectedIds: (ids: ID[]) => void;
  nextVersion: () => number;
  isCurrent: (version: number) => boolean;
};

const fetchAllScopes = async (plugin: string, connectionId: ID, signal: AbortSignal, isCurrent: () => boolean) => {
  const allItems = new Map<ID, ScopeSelectItem>();
  let nextPage = 1;
  let count = 0;
  let loadedCount = 0;
  let maxPages = 1;

  while (nextPage <= maxPages) {
    const res = await API.scope.list(plugin, connectionId, { page: nextPage, pageSize: LOAD_ALL_PAGE_SIZE }, signal);
    if (!isCurrent()) return undefined;

    const pageItems = (res.scopes ?? []).map((sc) => toDataScopeItem(plugin, sc));
    pageItems.forEach((item) => allItems.set(item.id, item));
    ({ count } = res);
    loadedCount += pageItems.length;
    maxPages = Math.max(1, Math.ceil(count / LOAD_ALL_PAGE_SIZE));
    nextPage += 1;

    if (!pageItems.length || loadedCount >= count) break;
  }

  return { items: Array.from(allItems.values()), count };
};

export const useSelectAll = ({
  plugin,
  connectionId,
  mergeItems,
  setTotal,
  setSelectedIds,
  nextVersion,
  isCurrent,
}: Options) => {
  const [selectingAll, setSelectingAll] = useState(false);
  const abortRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => abortRef.current?.abort(), []);

  const loadAll = async () => {
    const version = nextVersion();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSelectingAll(true);

    try {
      const loaded = await fetchAllScopes(plugin, connectionId, controller.signal, () => isCurrent(version));
      if (!loaded || !isCurrent(version)) return;

      mergeItems(loaded.items);
      setTotal(loaded.count);
      setSelectedIds(loaded.items.map((item) => item.id));
    } catch (err) {
      if (axios.isCancel(err)) return;
      if (isCurrent(version)) {
        message.error(toUserMessage(err, {}, COPY.error.loadAll));
      }
    } finally {
      if (isCurrent(version)) {
        setSelectingAll(false);
      }
    }
  };

  return { selectingAll, loadAll };
};
