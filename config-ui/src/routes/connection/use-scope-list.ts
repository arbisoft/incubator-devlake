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

import { useMemo } from 'react';

import API from '@/api';
import { useRefreshData } from '@/hooks';
import { useListState, useRefreshVersion } from '@/ui';

import { toScopeRows, type ScopeListItem } from './scope-table';

export const useScopeList = (plugin: string, connectionId: ID) => {
  const list = useListState<string, Record<string, never>>({ filters: {} });
  const { page, pageSize, keyword } = list;
  const { version, refresh } = useRefreshVersion();

  const { data, ready, error } = useRefreshData(
    () => API.scope.list(plugin, connectionId, { page, pageSize, searchTerm: keyword || undefined, blueprints: true }),
    [plugin, connectionId, version, page, pageSize, keyword],
  );
  const rows = useMemo(() => toScopeRows(plugin, data?.scopes as ScopeListItem[] | undefined), [plugin, data]);

  return { list, rows, total: data?.count ?? 0, ready, failed: error !== undefined, refresh };
};
