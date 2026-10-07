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

import { useDebounce } from 'ahooks';
import { message } from 'antd';
import axios from 'axios';
import { useEffect, useState } from 'react';

import API from '@/api';
import { toUserMessage } from '@/ui/utils';

import { COPY, SEARCH_DEBOUNCE_MS } from './constants';
import type { MergeItems, ScopeOption } from './types';
import { toDataScopeItem } from './utils';

type Settled = { term: string; options: ScopeOption[] };

export const useScopeSearch = (plugin: string, connectionId: ID, mergeItems: MergeItems) => {
  const [query, setQuery] = useState('');
  const [settled, setSettled] = useState<Settled>({ term: '', options: [] });
  const term = useDebounce(query, { wait: SEARCH_DEBOUNCE_MS });

  useEffect(() => {
    if (!term) return undefined;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await API.scope.list(plugin, connectionId, { searchTerm: term }, controller.signal);
        if (controller.signal.aborted) return;

        const scopeItems = (res.scopes ?? []).map((sc) => toDataScopeItem(plugin, sc));
        mergeItems(scopeItems);
        setSettled({ term, options: scopeItems.map((item) => ({ label: item.title, value: item.id })) });
      } catch (err) {
        if (axios.isCancel(err) || controller.signal.aborted) return;
        message.error(toUserMessage(err, {}, COPY.error.search));
        setSettled({ term, options: [] });
      }
    })();

    return () => controller.abort();
  }, [plugin, connectionId, term, mergeItems]);

  const options = query && settled.term === term ? settled.options : [];
  const searching = !!term && settled.term !== term;

  const reset = () => setQuery('');

  return { query, setQuery, options, searching, reset };
};
