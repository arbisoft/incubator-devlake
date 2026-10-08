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

export const STATUS_TONE = {
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  INFO: 'info',
  NEUTRAL: 'neutral',
} as const;

export const NAV_ITEM_KIND = { ROUTE: 'route', EXTERNAL: 'external', DIVIDER: 'divider' } as const;

export const MODAL_WIDTH = { SM: 'sm', MD: 'md', LG: 'lg' } as const;

export const SORT_ORDER = { ASC: 'asc', DESC: 'desc' } as const;

export const LIST_PARAMS = {
  PAGE: 'page',
  PAGE_SIZE: 'pageSize',
  KEYWORD: 'keyword',
  SORT_BY: 'sortBy',
  SORT_ORDER: 'sortOrder',
} as const;

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;

export const STORAGE_KEYS = {
  SIDEBAR_COLLAPSED: 'devlake.sidebarCollapsed',
  PLUGIN_DEPRECATION_DISMISSED: 'devlake.pluginDeprecationDismissed',
} as const;

export const ICON_SIZE_PX = { sm: 16, md: 24, lg: 40 } as const;

export const DATE_TIME_FORMAT = 'YYYY-MM-DD HH:mm';
export const SHORT_DATE_TIME_FORMAT = 'D MMM YYYY, HH:mm';
export const RELATIVE_NOW_SECONDS = 45;
export const MS_PER_SECOND = 1000;

export const COMMON_COPY = {
  genericError: 'Something went wrong. Please try again.',
  retry: 'Retry',
  search: 'Search',
  clear: 'Clear',
  cancel: 'Cancel',
  close: 'Close',
  opensInNewTab: '(opens in a new tab)',
  justNow: 'Just now',
  emptyValue: '-',
};
