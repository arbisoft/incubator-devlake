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

export const SCOPE_ITEM_TYPE = { GROUP: 'group', SCOPE: 'scope' } as const;

export const SCOPE_MODE = { SINGLE: 'single', MULTIPLE: 'multiple' } as const;

export const LOAD_STATUS = { INIT: 'init', LOADING: 'loading', CANCEL: 'cancel', LOADED: 'loaded' } as const;

export const ROOT_COLUMN_ID = 'root';

export const SEARCH_PAGE_SIZE = 50;
export const SEARCH_DEBOUNCE_MS = 500;
export const LOADING_ICON_SIZE = 20;

export const COLUMN_ID_PREFIX = 'miller-columns-column-';

// The field and query-param names each plugin's scope-duplicates API uses.
export const SCOPE_DUPLICATE_FIELDS: Record<string, { dataField: string; queryParam: string }> = {
  github: { dataField: 'githubId', queryParam: 'githubIds' },
  gitlab: { dataField: 'gitlabId', queryParam: 'gitlabIds' },
  bitbucket: { dataField: 'bitbucketId', queryParam: 'bitbucketIds' },
};

const ANOTHER_CONNECTION = 'another connection';
const quote = (name: string) => `"${name}"`;

export const COPY = {
  forbidden: 'You do not have permission to browse this connection.',
  searchFallback: 'Search',
  submit: 'Save',
  saved: 'Add data scope successful.',
  saveFailed: 'Could not add the data scope. Try again.',
  saveRejected: 'The selected data scope was rejected. Check the selection and try again.',
  disabledReason: 'Select at least one data scope.',
  loadFailed: 'Could not load the list. Try again.',
  selected: (count: number) => `${count} selected`,
  noneSelected: 'Please select scope...',
  clearAll: 'Clear all',
  remove: (label: string) => `Remove ${label}`,
  loadAll: 'Load all scopes to search by keywords',
  loadAllWarning: (title: string | undefined) =>
    `This operation may take a long time, as it iterates through all the ${title}.`,
  loadingScopes: 'Loading:',
  scopesFound: 'scopes found',
  cancel: 'Cancel',
  duplicate: {
    thisItem: 'This item',
    manyItems: 'One or more selected items',
    via: (connectionNames: string[]) => {
      if (connectionNames.length === 1) return `Connection ${quote(connectionNames[0])}`;
      if (connectionNames.length > 1) return `Connections ${connectionNames.map(quote).join(', ')}`;
      return ANOTHER_CONNECTION;
    },
    message: (label: string, via: string) =>
      `${label} is already connected via ${via}. Collecting it here will create duplicate records, which will inflate all metrics for this repository.`,
  },
};

export const SAVE_ERROR_MAP: Record<string, string> = { '400': COPY.saveRejected };

export const LOAD_ERROR_MAP: Record<string, string> = { '403': COPY.forbidden };
