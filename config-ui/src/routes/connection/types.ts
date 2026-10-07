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

import type { CATALOG_SORT, CONFLICT_KIND, DELETE_KIND, MANAGE_DIALOG_MODE } from './constants';
import type { ScopeRow } from './scope-table';

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

export type ConflictKind = (typeof CONFLICT_KIND)[keyof typeof CONFLICT_KIND];

export type DeletePending =
  | { kind: typeof DELETE_KIND.CONNECTION; name: string }
  | { kind: typeof DELETE_KIND.SCOPE_CLEAR | typeof DELETE_KIND.SCOPE_DELETE; scope: ScopeRow }
  | { kind: typeof DELETE_KIND.SCOPES_BULK; scopes: ScopeRow[] };

export type DeleteFailure = { conflict: boolean; names: string[] };

export type ConflictState = { kind: ConflictKind; names: string[] };

export type BulkOutcome = { id: ID; name: string; error?: string };

export type BulkDeleteState = {
  open: boolean;
  running: boolean;
  total: number;
  completed: number;
  outcomes: BulkOutcome[];
};

export type BulkSummary = { succeeded: number; failures: BulkOutcome[] };
