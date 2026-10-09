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

import type { DataScopeSelectProps } from './types';
import { useInitialScopes } from './use-initial-scopes';
import { useScopeItems } from './use-scope-items';
import { useScopeSearch } from './use-scope-search';
import { useSelectAll } from './use-select-all';
import { toSelectedOptions } from './utils';

type Options = Pick<DataScopeSelectProps, 'plugin' | 'connectionId' | 'initialScope' | 'onSubmit'>;

export const useDataScopeSelect = ({ plugin, connectionId, initialScope, onSubmit }: Options) => {
  const [selectedIds, setSelectedIds] = useState<ID[]>([]);
  const list = useScopeItems(plugin, connectionId);
  const { mergeItems, setTotal, nextVersion, isCurrent } = list;

  useInitialScopes({ plugin, connectionId, initialScope, mergeItems, setSelectedIds });
  const search = useScopeSearch(plugin, connectionId, mergeItems);
  const all = useSelectAll({ plugin, connectionId, mergeItems, setTotal, setSelectedIds, nextVersion, isCurrent });

  const { selectingAll } = all;
  const allSelected = list.total > 0 && selectedIds.length === list.total;

  const changeSelectAll = (checked: boolean) => {
    if (selectingAll) return;

    if (checked) {
      all.loadAll();
      return;
    }
    setSelectedIds([]);
  };

  const addSearchScope = (scopeId: ID) => {
    if (selectingAll) return;

    setSelectedIds((current) => (current.includes(scopeId) ? current : [...current, scopeId]));
    search.reset();
  };

  const changeSelection = (ids: ID[]) => {
    if (!selectingAll) {
      setSelectedIds(ids);
    }
  };

  return {
    list,
    search,
    selectedIds,
    selectedOptions: toSelectedOptions(selectedIds, list.items),
    selectingAll,
    allSelected,
    partialSelected: selectedIds.length > 0 && !allSelected,
    changeSelectAll,
    addSearchScope,
    changeSelection,
    setSelectedIds,
    submit: () => {
      if (!selectingAll) onSubmit?.(selectedIds);
    },
  };
};
