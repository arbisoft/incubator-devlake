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

import { getPluginScopeId, getPluginScopeName } from '@/plugins/utils';
import type { IDataScope } from '@/types';

import type { ScopeSelectItem } from './types';

export const toDataScopeItem = (plugin: string, sc: { scope: IDataScope }): ScopeSelectItem => ({
  parentId: null,
  id: getPluginScopeId(plugin, sc.scope),
  title: getPluginScopeName(plugin, sc.scope) || sc.scope.fullName || sc.scope.name,
  data: sc.scope,
});

export const mergeScopeItems = (current: ScopeSelectItem[], added: ScopeSelectItem[]): ScopeSelectItem[] => {
  const itemMap = new Map<ID, ScopeSelectItem>();
  [...current, ...added].forEach((item) => {
    itemMap.set(item.id, item);
  });
  return Array.from(itemMap.values());
};

export const toSelectedOptions = (selectedIds: ID[], items: ScopeSelectItem[]) => {
  const itemById = new Map(items.map((item) => [`${item.id}`, item]));
  return selectedIds.map((id) => ({ label: itemById.get(`${id}`)?.title ?? `${id}`, value: id }));
};
