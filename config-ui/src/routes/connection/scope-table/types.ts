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

import type { DataTableProps } from '@/ui';
import type { EmptyStateProps } from '@/ui/empty-state';

export type ScopeRow = {
  id: ID;
  name: string;
  projects: string[];
  configId?: ID;
  configName?: string;
};

export type ScopeListItem = {
  scope: { name: string; fullName: string };
  scopeConfig?: { id: ID; name: string };
  blueprints?: Array<{ projectName: string }>;
};

export type ScopeSelection = {
  selectedIds: ID[];
  onChange: (ids: ID[]) => void;
};

export type ScopeTableProps = {
  plugin: string;
  connectionId: ID;
  rows: ScopeRow[];
  total: number;
  loading: boolean;
  list: NonNullable<DataTableProps<ScopeRow>['list']>;
  empty: EmptyStateProps;
  selection: ScopeSelection;
  onScopeConfigChange: () => void;
  onClear?: (row: ScopeRow) => void;
  onDelete?: (row: ScopeRow) => void;
};

export type ScopeColumnOptions = Pick<
  ScopeTableProps,
  'plugin' | 'connectionId' | 'onScopeConfigChange' | 'onClear' | 'onDelete'
>;
