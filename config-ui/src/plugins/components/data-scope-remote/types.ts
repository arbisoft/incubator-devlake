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

import type { McsItem, MillerColumnsSelectProps } from 'miller-columns-select';

import type { IPluginConfig } from '@/types';

import type { LOAD_STATUS, SCOPE_ITEM_TYPE, SCOPE_MODE } from './constants';

type ScopeItemType = (typeof SCOPE_ITEM_TYPE)[keyof typeof SCOPE_ITEM_TYPE];
type ScopeMode = (typeof SCOPE_MODE)[keyof typeof SCOPE_MODE];
export type LoadStatus = (typeof LOAD_STATUS)[keyof typeof LOAD_STATUS];

type ScopeData = Record<string, unknown>;

export type ResItem = {
  type: ScopeItemType;
  parentId: ID | null;
  id: ID;
  name: string;
  fullName: string;
  data: ScopeData;
};

export type ScopeItem = McsItem<ResItem>;

type DisabledScope = { id: ID };

export type DataScopeConfig = IPluginConfig['dataScope'];

export type SearchProps = {
  mode: ScopeMode;
  plugin: string;
  connectionId: ID;
  config: DataScopeConfig;
  disabledScope: DisabledScope[];
  selectedScope: ScopeItem[];
  onChange: (selectedScope: ScopeItem[]) => void;
};

export type DataScopeRemoteProps = {
  mode?: ScopeMode;
  plugin: string;
  connectionId: ID;
  selectedScope: ScopeItem[];
  disabledScope?: DisabledScope[];
  onChangeSelectedScope: (scope: ScopeItem[]) => void;
};

export type DataScopeRemoteModalProps = {
  open: boolean;
  plugin: string;
  connectionId: ID;
  title: string;
  disabledScope?: DisabledScope[];
  onCancel: () => void;
  onSubmit: () => void;
};

export type ScopePanesProps<T> = Omit<
  MillerColumnsSelectProps<T>,
  'columnHeight' | 'renderTitle' | 'renderLoading' | 'renderError'
> & {
  firstColumnTitle?: string;
  compact?: boolean;
};

export type SelectedScopesProps = {
  plugin: string;
  scopes: ScopeItem[];
  onChange: (scopes: ScopeItem[]) => void;
};
