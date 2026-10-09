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

import type { ConnectionHealthMap } from '@/features/connections';
import { IConnectionStatus, type IConnection } from '@/types';
import { SORT_ORDER, type FilterTabItem, type SortState } from '@/ui';

import { CONNECTION_FILTER, COPY } from './constants';
import type { ConnectionFilter, ConnectionSortKey } from './types';

const statusOf = (connection: IConnection, health: ConnectionHealthMap) => health[connection.unique]?.status;

const FILTER_STATUS = {
  [CONNECTION_FILTER.CONNECTED]: IConnectionStatus.ONLINE,
  [CONNECTION_FILTER.FAILED]: IConnectionStatus.OFFLINE,
} as const;

export const filterConnections = (connections: IConnection[], health: ConnectionHealthMap, filter: ConnectionFilter) =>
  filter === CONNECTION_FILTER.ALL
    ? connections
    : connections.filter((connection) => statusOf(connection, health) === FILTER_STATUS[filter]);

export const buildFilterTabs = (connections: IConnection[], health: ConnectionHealthMap): FilterTabItem[] =>
  Object.values(CONNECTION_FILTER).map((key) => ({
    key,
    label: COPY.filters[key],
    count: filterConnections(connections, health, key).length,
  }));

export const sortConnections = (connections: IConnection[], sort?: SortState<ConnectionSortKey>) => {
  if (!sort) return connections;
  const direction = sort.sortOrder === SORT_ORDER.ASC ? 1 : -1;
  return [...connections].sort((a, b) => direction * a.name.localeCompare(b.name));
};

export const pageOf = <T>(items: T[], page: number, pageSize: number) =>
  items.slice((page - 1) * pageSize, page * pageSize);

export const toRepoCount = ({ count }: { count?: unknown }) => (typeof count === 'number' ? count : null);
