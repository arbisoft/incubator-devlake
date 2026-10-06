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

export const SECTION = {
  PLUGIN_ICON: 'pluginIcon',
  STATUS_BADGE: 'statusBadge',
  EXTERNAL_LINK: 'externalLink',
  IDENTITY_CELL: 'identityCell',
  KEY_VALUE_LIST: 'keyValueList',
  CODE_BLOCK: 'codeBlock',
  EMPTY_STATE: 'emptyState',
  METRIC_TILE: 'metricTile',
  PIPELINE_PROGRESS: 'pipelineProgress',
  SEARCH_INPUT: 'searchInput',
  FILTER_TABS: 'filterTabs',
  SORT_SELECT: 'sortSelect',
  TOOLBAR: 'toolbar',
  USE_LIST_STATE: 'useListState',
  USE_ROUTE_TAB: 'useRouteTab',
  USE_DOCUMENT_TITLE: 'useDocumentTitle',
  USE_IN_VIEW: 'useInView',
  USE_SIDEBAR_COLLAPSED: 'useSidebarCollapsed',
  USE_CONCURRENCY_QUEUE: 'useConcurrencyQueue',
  UTILS: 'utils',
} as const;

export const THEME_MODE_LABEL = { light: 'Light', dark: 'Dark', system: 'System' } as const;

export const COPY = {
  title: 'UI kit',
  themeLabel: 'Theme',
  sections: {
    pluginIcon: 'PluginIcon',
    statusBadge: 'StatusBadge',
    externalLink: 'ExternalLink',
    identityCell: 'IdentityCell',
    keyValueList: 'KeyValueList',
    codeBlock: 'CodeBlock',
    emptyState: 'EmptyState',
    metricTile: 'MetricTile',
    pipelineProgress: 'PipelineProgress',
    searchInput: 'SearchInput',
    filterTabs: 'FilterTabs',
    sortSelect: 'SortSelect',
    toolbar: 'Toolbar',
    useListState: 'useListState',
    useRouteTab: 'useRouteTab',
    useDocumentTitle: 'useDocumentTitle',
    useInView: 'useInView',
    useSidebarCollapsed: 'useSidebarCollapsed',
    useConcurrencyQueue: 'useConcurrencyQueue',
    utils: 'Utilities',
  },
  cases: {
    default: 'Default',
    empty: 'Empty',
    loading: 'Loading',
    error: 'Error',
    collapsed: 'Collapsed',
    longText: 'Long text, narrow container',
    overflow: 'Overflow',
    withIcon: 'With icon',
    withAction: 'With action',
    withValue: 'With value',
    clearable: 'Clearable',
    withCounts: 'With counts',
    manyItems: 'Many items',
    sizes: 'Sizes',
    fallback: 'Unknown plugin (fallback icon)',
    notJson: 'Not JSON',
    scrollable: 'Max height with scroll',
    startOnly: 'Start only',
    startAndEnd: 'Start and end',
    composed: 'Composed list toolbar',
    illustrations: 'Illustrations',
    page: 'Page size',
    section: 'Section size',
    noIllustration: 'No illustration',
    noData: 'No total',
    overshoot: 'More finished than total',
    metricsBar: 'In a bar',
    pill: 'Pill',
    flat: 'Flat',
  },
  statusBadge: {
    dot: 'Dot',
    text: 'Text',
    label: (tone: string) => `Tone ${tone}`,
    longLabel: 'Waiting for the upstream service to confirm the sync window',
  },
  externalLink: {
    docs: 'Read the setup guide',
    long: 'A very long link label that keeps going past the edge of the narrow container',
  },
  codeBlock: { copy: 'Copy JSON', plain: 'Plain log line that is not JSON, used to check the fallback' },
  emptyState: {
    emptyTitle: 'Nothing here yet',
    emptyDescription: 'Items you add will show up in this list.',
    errorTitle: 'Could not load this page',
    errorDescription: 'Check your connection and try again.',
    usersTitle: 'No users yet',
    usersDescription: 'Invite someone to give them access.',
    connectionTitle: 'No live connection',
    connectionDescription: 'There is no live connection available for the selected interface.',
    longTitle: 'A deliberately long title that has to wrap onto several lines inside the empty state',
    longDescription:
      'A deliberately long description that is much longer than the text column of an empty state so it must wrap and stay centred without overflowing its container.',
    retry: 'Retry',
    add: 'Add a connection',
  },
  metricTile: {
    label: 'Total connections',
    failed: 'Failed syncs',
    hint: 'Last 24 hours',
    longLabel: 'Records synced across every connected source this month',
  },
  pipelineProgress: { status: (status: string) => `Status ${status}` },
  searchInput: {
    placeholder: 'Search users',
    submitted: (keyword: string) => `Last search: "${keyword}"`,
    none: 'No search submitted yet',
  },
  filterTabs: { selected: (key: string) => `Selected: ${key}` },
  sortSelect: { selected: (key: string) => `Selected: ${key}` },
  toolbar: { start: 'Start slot', end: 'End slot', add: 'Add connection' },
  useListState: {
    keyword: 'Keyword',
    setKeyword: 'Set keyword',
    nextPage: 'Next page',
    setSize: 'Page size 50',
    filter: 'Filter: failed',
    sort: 'Sort: status desc',
    reset: 'Reset',
    state: 'State',
    query: 'toQuery()',
    note: 'The state lives in this page URL.',
  },
  useRouteTab: {
    active: (key: string) => `Active tab: ${key}`,
    go: (label: string) => `Go to ${label}`,
    hiddenNote: 'The "Hidden" tab is never active.',
  },
  useDocumentTitle: { page: 'Page name', current: (title: string) => `document.title: ${title}`, none: 'No page name' },
  useInView: {
    once: 'Once',
    repeat: 'Repeat',
    scroll: 'Scroll the box to reveal the target.',
    inView: 'In view',
    outOfView: 'Out of view',
  },
  useSidebarCollapsed: {
    collapsed: 'Collapsed (rail)',
    expanded: 'Expanded',
    note: 'Saved in localStorage; defaults to the rail below the tablet breakpoint.',
  },
  useConcurrencyQueue: {
    enqueue: 'Enqueue 8 jobs (limit 3)',
    duplicate: 'Enqueue job 1 again',
    state: (running: number, done: number) => `In flight: ${running}, finished: ${done}`,
    job: (n: number) => `Job ${n}`,
  },
  utils: {
    toUserMessage: 'toUserMessage',
    formatRelativeTime: 'formatRelativeTime',
    formatDateTime: 'formatDateTime',
    mapped: 'Mapped status 409',
    unmapped: 'Unmapped error',
    conflict: 'That name is already in use.',
  },
};
