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
import { WarningOutlined } from '@ant-design/icons';
import { Button, Switch } from 'antd';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import API from '@/api';
import { PATHS } from '@/config';
import {
  selectAllConnections,
  selectHealth,
  selectPlugins,
  selectWebhooks,
  useHealthChecks,
  WEBHOOK_PLUGIN,
} from '@/features/connections';
import { useAppSelector, useRefreshData } from '@/hooks';
import { getPluginConfig } from '@/plugins';
import type { IConnection } from '@/types';
import {
  EMPTY_ILLUSTRATION,
  EMPTY_STATE_SIZE,
  EmptyState,
  FilterTabs,
  FILTER_TABS_VARIANT,
  ListPage,
  ListToolbar,
  PageHeader,
  SORT_ORDER,
  SortSelect,
  useListState,
} from '@/ui';

import { toIntegrationSummaries } from './adapter';
import { CatalogCard } from './catalog-card';
import {
  buildCategoryTabs,
  filterByCategory,
  filterIntegrations,
  isCatalogSortKey,
  resolveCategory,
  sortIntegrations,
} from './catalog-utils';
import { CATALOG_FILTER, CATALOG_SORT, CATEGORY_ALL, CONNECTED_ONLY, COPY } from './constants';
import { ManageModal } from './manage-modal';
import * as S from './styled';
import type { CatalogSortKey, IntegrationSummary } from './types';
import { useDeprecationNotice } from './use-deprecation-notice';
import { useManageDialog } from './use-manage-dialog';

const NO_CONNECTIONS: IConnection[] = [];

const SORT_OPTIONS = [
  { key: CATALOG_SORT.ACTIVE, label: COPY.sort.active },
  { key: CATALOG_SORT.NAME, label: COPY.sort.name },
];

type CatalogFilters = { [CATALOG_FILTER.CATEGORY]: string; [CATALOG_FILTER.CONNECTED]: string };

export const Connections = () => {
  const navigate = useNavigate();
  const dialog = useManageDialog();
  const { check } = useHealthChecks();

  const plugins = useAppSelector(selectPlugins);
  const connections = useAppSelector(selectAllConnections);
  const webhooks = useAppSelector(selectWebhooks);
  const health = useAppSelector(selectHealth);
  const { data: otelConnections } = useRefreshData(() => API.otel.list(), []);

  const list = useListState<CatalogSortKey, CatalogFilters>({
    sort: { sortBy: CATALOG_SORT.ACTIVE, sortOrder: SORT_ORDER.DESC },
    filters: { [CATALOG_FILTER.CATEGORY]: CATEGORY_ALL, [CATALOG_FILTER.CONNECTED]: CONNECTED_ONLY.OFF },
  });
  const sortKey = list.sort && isCatalogSortKey(list.sort.sortBy) ? list.sort.sortBy : CATALOG_SORT.ACTIVE;
  const category = resolveCategory(list.filters.category);
  const connectedOnly = list.filters.connected === CONNECTED_ONLY.ON;

  const { notice: deprecatedPlugin, dismiss: dismissDeprecation } = useDeprecationNotice(
    plugins.filter((plugin) => plugin !== WEBHOOK_PLUGIN),
    connections,
  );

  const connectionsByPlugin = useMemo(() => {
    const groups = new Map<string, IConnection[]>();
    for (const connection of connections) {
      groups.set(connection.plugin, [...(groups.get(connection.plugin) ?? []), connection]);
    }
    return groups;
  }, [connections]);

  const summaries = useMemo(
    () =>
      toIntegrationSummaries({ plugins, connections, webhooks, health, otelConnections, getConfig: getPluginConfig }),
    [plugins, connections, webhooks, health, otelConnections],
  );

  const matching = useMemo(
    () => filterIntegrations(summaries, { keyword: list.keyword, category, connectedOnly }),
    [summaries, list.keyword, category, connectedOnly],
  );
  const tabs = useMemo(() => buildCategoryTabs(matching), [matching]);
  const visible = useMemo(
    () => sortIntegrations(filterByCategory(matching, category), sortKey),
    [matching, category, sortKey],
  );

  const handleManage = (item: IntegrationSummary) => (item.href ? navigate(item.href) : dialog.showList(item.key));
  const handleAdd = (item: IntegrationSummary) => {
    if (item.href) navigate(item.href);
    else if (item.key === WEBHOOK_PLUGIN) dialog.showList(item.key);
    else dialog.showForm(item.key);
  };
  const handleCreated = useCallback((plugin: string, id: ID) => navigate(PATHS.CONNECTION(plugin, id)), [navigate]);

  const isFiltered = list.keyword !== '' || category !== CATEGORY_ALL;
  const empty = isFiltered
    ? { ...COPY.noResults, action: <Button onClick={list.reset}>{COPY.clearFilters}</Button> }
    : {
        ...COPY.empty,
        illustration: EMPTY_ILLUSTRATION.NO_CONNECTION,
        action: (
          <Button type="primary" onClick={() => list.setFilter(CATALOG_FILTER.CONNECTED, CONNECTED_ONLY.OFF)}>
            {COPY.showAll}
          </Button>
        ),
      };

  return (
    <ListPage>
      <PageHeader title={COPY.title} description={COPY.description} />
      {deprecatedPlugin?.deprecationMessage && (
        <S.DeprecationAlert
          closable={{ onClose: dismissDeprecation }}
          showIcon
          type="warning"
          icon={<WarningOutlined />}
          title={COPY.deprecationTitle}
          description={deprecatedPlugin.deprecationMessage}
        />
      )}
      <ListToolbar
        list={list}
        searchPlaceholder={COPY.searchPlaceholder}
        filters={
          <SortSelect
            options={SORT_OPTIONS}
            value={sortKey}
            onChange={(key) =>
              isCatalogSortKey(key) &&
              list.setSort({ sortBy: key, sortOrder: key === CATALOG_SORT.NAME ? SORT_ORDER.ASC : SORT_ORDER.DESC })
            }
          />
        }
        end={
          <S.SwitchField>
            {COPY.connectedOnly}
            <Switch
              checked={connectedOnly}
              onChange={(checked) =>
                list.setFilter(CATALOG_FILTER.CONNECTED, checked ? CONNECTED_ONLY.ON : CONNECTED_ONLY.OFF)
              }
            />
          </S.SwitchField>
        }
      />
      <FilterTabs
        variant={FILTER_TABS_VARIANT.FLAT}
        items={tabs}
        value={category}
        onChange={(key) => list.setFilter(CATALOG_FILTER.CATEGORY, key)}
      />
      {visible.length === 0 ? (
        <EmptyState size={EMPTY_STATE_SIZE.SECTION} {...empty} />
      ) : (
        <S.Grid onFocus={dialog.rememberOpener}>
          {visible.map((item) => (
            <CatalogCard
              key={item.key}
              item={item}
              connections={connectionsByPlugin.get(item.key) ?? NO_CONNECTIONS}
              onCheck={check}
              onManage={handleManage}
              onAdd={handleAdd}
            />
          ))}
        </S.Grid>
      )}
      <ManageModal
        open={dialog.open}
        plugin={dialog.plugin}
        isForm={dialog.isForm}
        onClose={dialog.hide}
        onAfterClose={dialog.reset}
        onCreate={() => dialog.showForm(dialog.plugin)}
        onCreated={handleCreated}
      />
    </ListPage>
  );
};
