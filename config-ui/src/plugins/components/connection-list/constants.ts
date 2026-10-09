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

import { PAGE_SIZE_OPTIONS } from '@/ui/constants';

export const CONNECTION_FILTER = { ALL: 'all', CONNECTED: 'connected', FAILED: 'failed' } as const;

export const CONNECTION_SORT_KEY = { NAME: 'name' } as const;

export const COLUMN_KEY = { NAME: 'name', STATUS: 'status', REPOS: 'repos', ACTIONS: 'actions' } as const;

export const REPO_COUNT_CONCURRENCY = 3;

export const REPO_COUNT_QUERY = { page: 1, pageSize: 1 } as const;

export const PAGE_SIZES = PAGE_SIZE_OPTIONS;
export const [DEFAULT_PAGE_SIZE] = PAGE_SIZE_OPTIONS;
export const FIRST_PAGE = 1;

export const COPY = {
  tableLabel: (name: string) => `${name} connections`,
  add: 'Add a Connection',
  columns: { name: 'Connection Name', status: 'Status', repos: 'Repo Count', actions: 'Action' },
  filters: { all: 'All', connected: 'Connected', failed: 'Failed' },
  details: 'Details',
  edit: 'Edit',
  detailsFor: (name: string) => `Details: ${name}`,
  editFor: (name: string) => `Edit: ${name}`,
  noRepoCount: '—',
  empty: {
    title: 'No connections yet',
    description: 'Add a connection to start collecting data from this integration.',
  },
  noResults: {
    title: 'No connections in this view',
    description: 'Switch to another tab to see the rest.',
  },
};
