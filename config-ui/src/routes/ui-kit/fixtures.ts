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

import { PATHS } from '@/config';
import { STATUS_TONE } from '@/ui/constants';
import { PIPELINE_PROGRESS_STATUS } from '@/ui/pipeline-progress';
import type { RouteTab } from '@/ui/types';

import type { UserRow } from './types';

export const PLUGIN_KEYS = ['github', 'gitlab', 'jira', 'jenkins', 'slack', 'webhook'];
export const UNKNOWN_PLUGIN_KEY = 'not-a-plugin';

export const TONE_LABELS: Record<string, string> = {
  [STATUS_TONE.SUCCESS]: 'Connected',
  [STATUS_TONE.WARNING]: 'Degraded',
  [STATUS_TONE.ERROR]: 'Failed',
  [STATUS_TONE.INFO]: 'Syncing',
  [STATUS_TONE.NEUTRAL]: 'Not started',
};

export const KEY_VALUE_ITEMS = [
  { label: 'When', value: '4 Sept 2026, 16:20 (UTC+05:00)' },
  { label: 'Actor', value: 'jane.admin@example.com' },
  { label: 'Source IP', value: '203.0.113.24' },
  { label: 'Request ID', value: 'req_8f21c4ad9e' },
];

export const KEY_VALUE_LONG_ITEMS = [
  {
    label: 'Endpoint',
    value: 'https://very-long-hostname.example.com/api/v2/resources/with/a/really/long/path/that/never/ends',
  },
  {
    label: 'Description',
    value: 'A long free-text value that has to wrap across several lines without breaking the label column.',
  },
];

export const JSON_SAMPLE = {
  status: 'ok',
  event: 'user.role_changed',
  user_id: 'usr_4f8ac21b',
  role: { from: 'regular_user', to: 'customer_admin' },
  applied_at: '2026-09-04T16:20:11Z',
};

export const JSON_LONG_SAMPLE = {
  tasks: Array.from({ length: 12 }, (_, index) => ({ id: index + 1, plugin: 'github', status: 'TASK_COMPLETED' })),
};

export const FILTER_ITEMS = [
  { key: 'all', label: 'All', count: 30 },
  { key: 'scm', label: 'Code & SCM', count: 6 },
  { key: 'ci', label: 'CI/CD & Automation', count: 4 },
  { key: 'issues', label: 'Issue & Project Tracking', count: 9 },
  { key: 'ai', label: 'AI & Analytics', count: 6 },
  { key: 'custom', label: 'Custom & Webhooks', count: 5 },
];

export const FILTER_ITEMS_PLAIN = FILTER_ITEMS.slice(0, 3).map(({ key, label }) => ({ key, label }));

export const FILTER_ITEMS_MANY = Array.from({ length: 18 }, (_, index) => ({
  key: `category-${index}`,
  label: `Category number ${index + 1}`,
  count: index,
}));

export const SORT_OPTIONS = [
  { key: 'active', label: 'Active first' },
  { key: 'name', label: 'Name A to Z' },
  { key: 'recent', label: 'Recently added' },
];

export const PIPELINE_CASES = [
  { status: PIPELINE_PROGRESS_STATUS.PENDING, finished: 0, total: 12 },
  { status: PIPELINE_PROGRESS_STATUS.RUNNING, finished: 7, total: 12 },
  { status: PIPELINE_PROGRESS_STATUS.COMPLETED, finished: 12, total: 12 },
  { status: PIPELINE_PROGRESS_STATUS.FAILED, finished: 5, total: 12 },
];

export const ROUTE_TABS: RouteTab[] = [
  { key: 'overview', label: 'Overview', path: PATHS.UI_KIT() },
  { key: 'settings', label: 'Settings', path: `${PATHS.UI_KIT()}/settings` },
  { key: 'hidden', label: 'Hidden', path: `${PATHS.UI_KIT()}/hidden`, visible: false },
];

export const LIST_DEFAULTS = {
  sort: { sortBy: 'name', sortOrder: 'asc' as const },
  filters: { status: 'all' },
};

export const QUEUE_LIMIT = 3;
export const QUEUE_JOB_COUNT = 8;
export const QUEUE_JOB_MS = 600;

export const ERROR_CASES = {
  conflict: { response: { status: 409, data: { message: 'pq: duplicate key value (409)' } } },
  unmapped: new Error('dial tcp 10.0.0.1:5432: connect: connection refused'),
};

export const RELATIVE_OFFSETS_MS = [10_000, 5 * 60_000, 3 * 3_600_000, 2 * 86_400_000];

export const DOCS_HREF = 'https://devlake.apache.org/docs/Overview';

export const IDENTITY = { primary: 'Jane Admin', secondary: 'jane.admin@example.com' };
export const IDENTITY_LONG = {
  primary: 'A user with an extraordinarily long display name that cannot fit',
  secondary: 'a.user.with.an.extraordinarily.long.address@subdomain.example.com',
};

export const METRIC_TIME = { label: 'Avg sync time', value: '4m 12s' };
export const METRIC_LONG_VALUE = '48,212,903,114,552';

const FIRST_NAMES = ['Jane', 'Alex', 'Sam', 'Priya', 'Chen', 'Maria', 'Omar', 'Lena', 'Noah'];
const LAST_NAMES = ['Admin', 'Doe', 'Lee', 'Park', 'Smith'];
const ROLES = ['Customer Administrator', 'Regular User', 'Viewer'];
const TABLE_ROW_COUNT = 45;
const LONG_NOTE_EVERY = 7;

export const TABLE_ROWS: UserRow[] = Array.from({ length: TABLE_ROW_COUNT }, (_, index) => {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[index % LAST_NAMES.length];
  return {
    id: index + 1,
    name: `${first} ${last}`,
    email: `${first}.${last}@example.com`.toLowerCase(),
    role: ROLES[index % ROLES.length],
    status: index % 3 === 2 ? 'inactive' : 'active',
    hasNote: index % LONG_NOTE_EVERY === 0,
  };
});

export const TABLE_LIST_DEFAULTS = { pageSize: 10, sort: { sortBy: 'name', sortOrder: 'asc' as const }, filters: {} };
export const TABLE_SELECTED_ROWS = [1, 3];

export const HEALTH_RETEST_MS = 1200;
export const HEALTH_TESTED_AT_OFFSET_MS = 5 * 60_000;

export const SHELL_SAMPLE =
  'curl https://example.com/api/rest/plugins/webhook/connections/1/issues -X \'POST\' -H \'Authorization: Bearer {API_KEY}\' -d \'{"issueKey": "DLK-1234", "title": "an incident"}\'';
