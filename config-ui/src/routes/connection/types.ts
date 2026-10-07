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
import type { IntegrationCategory } from '@/plugins/catalog';
import type { IPluginConfig } from '@/types';

import type { CATALOG_SORT, MANAGE_DIALOG_MODE } from './constants';

export type OtelCredentialSummary = { active: number; restartRequired: number; recoveryRequired: number };

export type IntegrationSummary = {
  key: string;
  name: string;
  icon: IPluginConfig['icon'];
  category: IntegrationCategory;
  weight: number;
  beta: boolean;
  deprecated: boolean;
  connections: number;
  failed: number;
  href?: string;
  docsHref?: string;
  otel?: OtelCredentialSummary;
};

export type CatalogSortKey = (typeof CATALOG_SORT)[keyof typeof CATALOG_SORT];

export type CatalogQuery = { keyword: string; category: string; connectedOnly: boolean };

export type ManageDialogMode = (typeof MANAGE_DIALOG_MODE)[keyof typeof MANAGE_DIALOG_MODE];
