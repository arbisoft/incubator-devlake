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
import { INTEGRATION_CATEGORY } from '@/plugins/catalog';
import { STATUS_TONE } from '@/ui/constants';
import type { StatusTone } from '@/ui/types';

import { CATALOG_SORT, CATEGORY_ALL, COPY } from './constants';
import type { CatalogQuery, CatalogSortKey, IntegrationSummary, OtelCredentialSummary } from './types';

const byName = (a: IntegrationSummary, b: IntegrationSummary) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

const isConnected = ({ connections }: IntegrationSummary) => connections > 0;

const COMPARATORS: Record<CatalogSortKey, (a: IntegrationSummary, b: IntegrationSummary) => number> = {
  [CATALOG_SORT.ACTIVE]: (a, b) =>
    Number(isConnected(b)) - Number(isConnected(a)) || a.weight - b.weight || byName(a, b),
  [CATALOG_SORT.NAME]: byName,
};

export const isCatalogSortKey = (value: string): value is CatalogSortKey =>
  (Object.values(CATALOG_SORT) as string[]).includes(value);

export const sortIntegrations = (items: IntegrationSummary[], sort: CatalogSortKey) =>
  [...items].sort(COMPARATORS[sort]);

const matchesKeyword = ({ name, key }: IntegrationSummary, keyword: string) => {
  const needle = keyword.trim().toLowerCase();
  return needle === '' || name.toLowerCase().includes(needle) || key.toLowerCase().includes(needle);
};

// Search and "connected only" narrow the catalog; the category tab is applied on top, so tab counts follow them.
export const filterIntegrations = (items: IntegrationSummary[], { keyword, connectedOnly }: CatalogQuery) =>
  items.filter((item) => matchesKeyword(item, keyword) && (!connectedOnly || isConnected(item)));

export const filterByCategory = (items: IntegrationSummary[], category: string) =>
  category === CATEGORY_ALL ? items : items.filter((item) => item.category === category);

export const buildCategoryTabs = (items: IntegrationSummary[]) => [
  { key: CATEGORY_ALL, label: COPY.allCategories, count: items.length },
  ...Object.values(INTEGRATION_CATEGORY).map((category) => ({
    key: category,
    label: category,
    count: items.filter((item) => item.category === category).length,
  })),
];

export const resolveCategory = (value: string) =>
  (Object.values(INTEGRATION_CATEGORY) as string[]).includes(value) ? value : CATEGORY_ALL;

export const buildOtelBadges = ({
  active,
  recoveryRequired,
  restartRequired,
}: OtelCredentialSummary): Array<{ tone: StatusTone; label: string }> =>
  [
    { count: active, tone: STATUS_TONE.SUCCESS, label: COPY.otel.active(active) },
    { count: recoveryRequired, tone: STATUS_TONE.ERROR, label: COPY.otel.recovery(recoveryRequired) },
    { count: restartRequired, tone: STATUS_TONE.WARNING, label: COPY.otel.action(restartRequired) },
  ]
    .filter(({ count }) => count > 0)
    .map(({ tone, label }) => ({ tone, label }));
