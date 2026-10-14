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
import { formatPlural } from '@/utils/text';

export const COPY = {
  title: 'Connections',
  description: 'Connect data sources and webhooks, then reuse them when syncing your projects.',
  deprecationTitle: 'Plugin deprecation notice',
  searchPlaceholder: 'Search integrations',
  connectedOnly: 'Show connected only',
  allCategories: 'All',
  otelName: 'Claude Code OTel',
  sort: { active: 'Active first', name: 'A to Z' },
  menu: { manage: 'Manage connections', add: 'Add connection', open: 'Open' },
  otel: {
    active: (count: number) => formatPlural(count, 'active credential'),
    recovery: (count: number) => `${formatPlural(count, 'connection')} needing storage recovery`,
    action: (count: number) => `${formatPlural(count, 'connection')} requiring action`,
  },
  empty: {
    title: 'No live connection',
    description: 'No integration has a connection yet. Add one, or show every integration.',
  },
  noResults: {
    title: 'No integrations found',
    description: 'Try a different search or category.',
  },
  showAll: 'Show all integrations',
  clearFilters: 'Clear filters',
};

export const CATALOG_SORT = { ACTIVE: 'active', NAME: 'name' } as const;

export const CATALOG_FILTER = { CATEGORY: 'category', CONNECTED: 'connected' } as const;

export const CARD_MENU_KEY = { OPEN: 'open', MANAGE: 'manage', ADD: 'add' } as const;

export const CATEGORY_ALL = 'all';

export const CONNECTED_ONLY = { ON: 'on', OFF: 'off' } as const;

export const OTEL_INTEGRATION_KEY = 'claude_otel';

export const MANAGE_DIALOG_MODE = { LIST: 'list', FORM: 'form' } as const;

export const DELETE_KIND = {
  CONNECTION: 'connection',
  SCOPE_CLEAR: 'scopeClear',
  SCOPE_DELETE: 'scopeDelete',
  SCOPES_BULK: 'scopesBulk',
} as const;

export const CONFLICT_KIND = { CONNECTION: 'connection', SCOPE: 'scope' } as const;

export const HTTP_STATUS = { FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409 } as const;

export const BULK_DELETE_CONCURRENCY = 3;
export const MAX_LISTED_SCOPES = 5;
export const NO_SCOPE_CONFIG = 'None';
export const SCOPE_CONFIG_UNSUPPORTED_PLUGIN = 'tapd';

export const DETAIL_COPY = {
  breadcrumbRoot: 'Connections',
  description: "To view DORA metrics, you'll need to add Scope Configs.",
  deleteConnection: 'Delete connection',
  searchPlaceholder: 'Search data scope',
  associate: 'Associate scope config',
  deleteScopes: 'Delete data scope',
  addScope: 'Add data scope',
  addScopeTitle: (name: string) => `Add Data Scope: ${name}`,
  associateTitle: 'Associate Scope Config',
  empty: {
    title: 'No data scopes yet',
    description: 'Add a data scope to start collecting data from this connection.',
  },
  noResults: {
    title: 'No data scopes match your search',
    description: 'Try a different name.',
  },
  toast: {
    connectionDeleted: 'Delete Connection Successful.',
    scopeDeleted: 'Delete Data Scope successful.',
    scopeCleared: 'Clear historical data successful.',
    associated: 'Associate scope config successful.',
    dissociated: 'Dis-associate scope config successful.',
    configsUpdated:
      'Scope Config(s) have been updated. If you would like to re-transform or re-collect the data in the related project(s), please go to the Project page and do so.',
  },
  confirm: {
    [DELETE_KIND.CONNECTION]: {
      title: (name: string) => `Delete “${name}”?`,
      description: () =>
        'This operation cannot be undone. Deleting a data connection will delete all data that has been collected through it.',
      confirm: 'Delete connection',
    },
    [DELETE_KIND.SCOPE_CLEAR]: {
      title: (name: string) => `Clear the historical data of “${name}”?`,
      description: () => 'This operation cannot be undone. The data scope stays; its collected data is removed.',
      confirm: 'Clear data',
    },
    [DELETE_KIND.SCOPE_DELETE]: {
      title: (name: string) => `Delete “${name}”?`,
      description: () =>
        'This operation cannot be undone. Deleting a data scope will delete all data that has been collected in the past.',
      confirm: 'Delete scope',
    },
    [DELETE_KIND.SCOPES_BULK]: {
      title: (count: number) => `Delete ${formatPlural(count, 'data scope')}?`,
      description: (names: string, more: number) => {
        const rest = more > 0 ? `, and ${more} more` : '';
        return `This operation cannot be undone. All selected scopes and their historical data will be permanently removed: ${names}${rest}.`;
      },
      confirm: 'Delete data',
    },
  },
  conflict: {
    [CONFLICT_KIND.CONNECTION]: {
      title: 'This Data Connection can not be deleted.',
      body: 'This Data Connection can not be deleted because it has been used in the following projects/blueprints:',
    },
    [CONFLICT_KIND.SCOPE]: {
      title: 'This Data Scope can not be deleted.',
      body: 'This Data Scope can not be deleted because it has been used in the following projects/blueprints:',
    },
    generic: 'It is still in use by a project or blueprint. Remove it there first, then try again.',
    close: 'Close',
  },
  bulk: {
    title: 'Delete Selected Data Scopes',
    description:
      'This will delete all selected data scopes. This operation cannot be undone. If any scope fails to delete, it will be listed below after the operation.',
    progress: (completed: number, total: number) => `Progress: ${completed}/${total}`,
    progressLabel: 'Deletion progress',
    summary: 'Summary',
    succeeded: 'Successful deletions',
    failed: 'Failed deletions',
    failures: 'Failed Deletions',
    failure: (name: string, reason: string) => `${name} - ${reason}`,
    close: 'Ok',
  },
  errors: {
    failed: 'Operation failed. Please try again.',
    forbidden: 'You do not have permission to change this connection.',
    notFound: 'This item no longer exists. Refresh the page and try again.',
    inUse: 'It is still in use by a project or blueprint.',
    associate: 'Could not update the scope config. Please try again.',
  },
};

export const DELETE_ERROR_MAP: Record<string, string> = {
  [HTTP_STATUS.FORBIDDEN]: DETAIL_COPY.errors.forbidden,
  [HTTP_STATUS.NOT_FOUND]: DETAIL_COPY.errors.notFound,
  [HTTP_STATUS.CONFLICT]: DETAIL_COPY.errors.inUse,
};
