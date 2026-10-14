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
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';

import API from '@/api';
import { toUserMessage } from '@/ui/utils';

import { COPY, LIST_PAGE_SIZE } from './constants';
import type { ScopeSelectItem } from './types';
import { mergeScopeItems, toDataScopeItem } from './utils';

export const useScopeItems = (plugin: string, connectionId: ID) => {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ScopeSelectItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listKey, setListKey] = useState(0);
  const requestVersionRef = useRef(0);
  const abortRef = useRef<AbortController | undefined>(undefined);

  const mergeItems = useCallback(
    (added: ScopeSelectItem[]) => setItems((current) => mergeScopeItems(current, added)),
    [],
  );

  const nextVersion = useCallback(() => {
    requestVersionRef.current += 1;
    return requestVersionRef.current;
  }, []);

  const isCurrent = useCallback((version: number) => version === requestVersionRef.current, []);

  const getDataScope = useCallback(
    async (targetPage: number, requestVersion = requestVersionRef.current) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await API.scope.list(
          plugin,
          connectionId,
          { page: targetPage, pageSize: LIST_PAGE_SIZE },
          controller.signal,
        );
        if (!isCurrent(requestVersion)) return;

        mergeItems((res.scopes ?? []).map((sc) => toDataScopeItem(plugin, sc)));
        setTotal(res.count);
      } catch (err) {
        if (axios.isCancel(err)) return;
        if (isCurrent(requestVersion)) {
          message.error(toUserMessage(err, {}, COPY.error.list));
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = undefined;
        }
        if (targetPage === 1 && isCurrent(requestVersion)) {
          setLoading(false);
        }
      }
    },
    [connectionId, isCurrent, mergeItems, plugin],
  );

  const fetchPage = useEffectEvent((targetPage: number) => getDataScope(targetPage));

  useEffect(() => {
    fetchPage(page);
  }, [page, plugin, connectionId]);

  useEffect(
    () => () => {
      requestVersionRef.current += 1;
      abortRef.current?.abort();
    },
    [],
  );

  const loadMore = () => {
    if (items.length >= total) return;
    setPage((current) => current + 1);
  };

  const refresh = () => {
    const requestVersion = nextVersion();
    setItems([]);
    setLoading(true);
    setListKey((current) => current + 1);

    if (page === 1) {
      getDataScope(1, requestVersion);
      return;
    }

    setPage(1);
  };

  return { loading, items, total, listKey, mergeItems, setTotal, nextVersion, isCurrent, loadMore, refresh };
};
