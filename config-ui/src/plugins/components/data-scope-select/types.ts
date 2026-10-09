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

import type { McsItem } from 'miller-columns-select';

import type { IDataScope } from '@/types';

export type ScopeSelectItem = McsItem<{ data: IDataScope }>;

export type InitialScope = { id: ID; scope?: IDataScope };

export type DataScopeSelectProps = {
  plugin: string;
  connectionId: ID;
  showWarning?: boolean;
  initialScope?: InitialScope[];
  onCancel?: () => void;
  onSubmit?: (scopeIds: ID[]) => void;
};

export type ScopeOption = { label: string; value: ID };

export type MergeItems = (items: ScopeSelectItem[]) => void;
