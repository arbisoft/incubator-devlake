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
  manageTitle: (name: string) => `Manage Connections: ${name}`,
};

export const CATALOG_SORT = { ACTIVE: 'active', NAME: 'name' } as const;

export const CATALOG_FILTER = { CATEGORY: 'category', CONNECTED: 'connected' } as const;

export const CARD_MENU_KEY = { OPEN: 'open', MANAGE: 'manage', ADD: 'add' } as const;

export const CATEGORY_ALL = 'all';

export const CONNECTED_ONLY = { ON: 'on', OFF: 'off' } as const;

export const OTEL_INTEGRATION_KEY = 'claude_otel';

export const MANAGE_MODAL_WIDTH = 820;

export const MANAGE_DIALOG_MODE = { LIST: 'list', FORM: 'form' } as const;
