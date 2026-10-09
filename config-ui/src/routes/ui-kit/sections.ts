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

import { AccountBlockDemo } from './account-block.demo';
import { AppShellDemo } from './app-shell.demo';
import { BrandBlockDemo } from './brand-block.demo';
import { CodeBlockDemo } from './code-block.demo';
import { ConfirmModalDemo } from './confirm-modal.demo';
import { ConnectionHealthDemo } from './connection-health.demo';
import { SECTION } from './constants';
import { DataTableDemo } from './data-table.demo';
import { DetailDrawerDemo } from './detail-drawer.demo';
import { EmptyStateDemo } from './empty-state.demo';
import { ExternalLinkDemo } from './external-link.demo';
import { FilterTabsDemo } from './filter-tabs.demo';
import { FormFieldDemo } from './form-field.demo';
import { FormModalDemo } from './form-modal.demo';
import { IdentityCellDemo } from './identity-cell.demo';
import { IntegrationCardDemo } from './integration-card.demo';
import { KeyValueListDemo } from './key-value-list.demo';
import { ListPageDemo } from './list-page.demo';
import { ListToolbarDemo } from './list-toolbar.demo';
import { MetricTileDemo } from './metric-tile.demo';
import { OverflowListDemo } from './overflow-list.demo';
import { PageFooterDemo } from './page-footer.demo';
import { PageHeaderDemo } from './page-header.demo';
import { PipelineProgressDemo } from './pipeline-progress.demo';
import { PluginIconDemo } from './plugin-icon.demo';
import { ProgressBannerDemo } from './progress-banner.demo';
import { RouteTabsDemo } from './route-tabs.demo';
import { RowLinkDemo } from './row-link.demo';
import { SearchInputDemo } from './search-input.demo';
import { SectionCardDemo } from './section-card.demo';
import { SidebarNavDemo } from './sidebar-nav.demo';
import { SortSelectDemo } from './sort-select.demo';
import { StatusBadgeDemo } from './status-badge.demo';
import { ToolbarDemo } from './toolbar.demo';
import type { SectionDefinition } from './types';
import { UseConcurrencyQueueDemo } from './use-concurrency-queue.demo';
import { UseDocumentTitleDemo } from './use-document-title.demo';
import { UseInViewDemo } from './use-in-view.demo';
import { UseListStateDemo } from './use-list-state.demo';
import { UseModalFormDemo } from './use-modal-form.demo';
import { UseRefreshVersionDemo } from './use-refresh-version.demo';
import { UseRouteTabDemo } from './use-route-tab.demo';
import { UseSidebarCollapsedDemo } from './use-sidebar-collapsed.demo';
import { UtilsDemo } from './utils.demo';

export const SECTIONS: SectionDefinition[] = [
  { id: SECTION.PLUGIN_ICON, Demo: PluginIconDemo },
  { id: SECTION.STATUS_BADGE, Demo: StatusBadgeDemo },
  { id: SECTION.EXTERNAL_LINK, Demo: ExternalLinkDemo },
  { id: SECTION.IDENTITY_CELL, Demo: IdentityCellDemo },
  { id: SECTION.KEY_VALUE_LIST, Demo: KeyValueListDemo },
  { id: SECTION.CODE_BLOCK, Demo: CodeBlockDemo },
  { id: SECTION.EMPTY_STATE, Demo: EmptyStateDemo },
  { id: SECTION.METRIC_TILE, Demo: MetricTileDemo },
  { id: SECTION.PIPELINE_PROGRESS, Demo: PipelineProgressDemo },
  { id: SECTION.SEARCH_INPUT, Demo: SearchInputDemo },
  { id: SECTION.FILTER_TABS, Demo: FilterTabsDemo },
  { id: SECTION.SORT_SELECT, Demo: SortSelectDemo },
  { id: SECTION.TOOLBAR, Demo: ToolbarDemo },
  { id: SECTION.ACCOUNT_BLOCK, Demo: AccountBlockDemo },
  { id: SECTION.APP_SHELL, Demo: AppShellDemo },
  { id: SECTION.BRAND_BLOCK, Demo: BrandBlockDemo },
  { id: SECTION.CONFIRM_MODAL, Demo: ConfirmModalDemo },
  { id: SECTION.CONNECTION_HEALTH, Demo: ConnectionHealthDemo },
  { id: SECTION.DATA_TABLE, Demo: DataTableDemo },
  { id: SECTION.DETAIL_DRAWER, Demo: DetailDrawerDemo },
  { id: SECTION.FORM_FIELD, Demo: FormFieldDemo },
  { id: SECTION.FORM_MODAL, Demo: FormModalDemo },
  { id: SECTION.OVERFLOW_LIST, Demo: OverflowListDemo },
  { id: SECTION.LIST_PAGE, Demo: ListPageDemo },
  { id: SECTION.LIST_TOOLBAR, Demo: ListToolbarDemo },
  { id: SECTION.ROW_LINK, Demo: RowLinkDemo },
  { id: SECTION.INTEGRATION_CARD, Demo: IntegrationCardDemo },
  { id: SECTION.PAGE_FOOTER, Demo: PageFooterDemo },
  { id: SECTION.PAGE_HEADER, Demo: PageHeaderDemo },
  { id: SECTION.PROGRESS_BANNER, Demo: ProgressBannerDemo },
  { id: SECTION.ROUTE_TABS, Demo: RouteTabsDemo },
  { id: SECTION.SECTION_CARD, Demo: SectionCardDemo },
  { id: SECTION.SIDEBAR_NAV, Demo: SidebarNavDemo },
  { id: SECTION.USE_LIST_STATE, Demo: UseListStateDemo },
  { id: SECTION.USE_ROUTE_TAB, Demo: UseRouteTabDemo },
  { id: SECTION.USE_REFRESH_VERSION, Demo: UseRefreshVersionDemo },
  { id: SECTION.USE_MODAL_FORM, Demo: UseModalFormDemo },
  { id: SECTION.USE_DOCUMENT_TITLE, Demo: UseDocumentTitleDemo },
  { id: SECTION.USE_IN_VIEW, Demo: UseInViewDemo },
  { id: SECTION.USE_SIDEBAR_COLLAPSED, Demo: UseSidebarCollapsedDemo },
  { id: SECTION.USE_CONCURRENCY_QUEUE, Demo: UseConcurrencyQueueDemo },
  { id: SECTION.UTILS, Demo: UtilsDemo },
];
