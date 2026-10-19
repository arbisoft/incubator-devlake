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

import type { ScopeDuplicateGroup } from '@/api/scope';

import { COPY, ROOT_COLUMN_ID, SCOPE_DUPLICATE_FIELDS, SCOPE_ITEM_TYPE } from './constants';
import type { DataScopeConfig, ResItem, ScopeItem } from './types';

export const getScopeDuplicateId = (plugin: string, scope: Pick<ScopeItem, 'id' | 'data'>): string | undefined => {
  const dataField = SCOPE_DUPLICATE_FIELDS[plugin]?.dataField;
  const fromData = dataField ? scope.data?.[dataField] : undefined;
  if (typeof fromData === 'number' && fromData > 0) {
    return String(fromData);
  }
  if (typeof fromData === 'string' && fromData) {
    return fromData;
  }
  if (scope.id !== undefined && scope.id !== null && String(scope.id) !== '') {
    return String(scope.id);
  }
  return undefined;
};

export const buildDuplicateWarning = (duplicates: ScopeDuplicateGroup[]): string => {
  const connectionNames = Array.from(
    new Set(duplicates.flatMap((d) => d.connections.map((c) => c.connectionName).filter(Boolean))),
  );
  const label =
    duplicates.length === 1
      ? duplicates[0].fullName || duplicates[0].htmlUrl || COPY.duplicate.thisItem
      : COPY.duplicate.manyItems;

  return COPY.duplicate.message(label, COPY.duplicate.via(connectionNames));
};

export const getScopeLabel = (name: string, scope: Pick<ScopeItem, 'id' | 'name' | 'fullName'>): string =>
  name || scope.fullName || scope.name || String(scope.id);

export const toBrowseProps = (miller: { loadedIds: ID[]; errorId?: ID | null }, config: DataScopeConfig) => ({
  columnCount: config.millerColumn?.columnCount ?? 1,
  firstColumnTitle: config.millerColumn?.firstColumnTitle,
  getCanExpand: (it: Pick<ResItem, 'type'>) => it.type === SCOPE_ITEM_TYPE.GROUP,
  getHasMore: (id: ID | null) => !miller.loadedIds.includes(id ?? ROOT_COLUMN_ID),
  getHasError: (id: ID | null) => id === miller.errorId,
});

export const toSelectionProps = (
  disabledScope: { id: ID }[],
  selectedScope: { id: ID }[],
  pool: ScopeItem[],
  onChange: (selected: ScopeItem[]) => void,
) => ({
  disabledIds: disabledScope.map((it) => it.id),
  selectedIds: selectedScope.map((it) => it.id),
  onSelectItemIds: (ids: ID[]) => onChange(pool.filter((it) => ids.includes(it.id))),
});
