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

export const LIST_PAGE_SIZE = 10;
export const LOAD_ALL_PAGE_SIZE = 1000;
export const INITIAL_LABEL_LOOKUP_LIMIT = 20;
export const SEARCH_DEBOUNCE_MS = 500;

export const COPY = {
  title: 'Select Data Scope',
  description: {
    intro:
      'Select the data scope in this Connection that you wish to associate with this Project. If you wish to add more Data Scope to this Connection, please',
    link: 'go to the Connection page',
    emptyIntro: 'There is no Data Scope in this connection yet, please',
    emptyLink: 'add Data Scope and manage their Scope Configs',
    emptyOutro: 'first.',
  },
  warning: {
    intro:
      'Unchecking Data Scope below will only remove it from the current Project and will not delete the historical data. If you would like to delete the data of Data Scope, please',
  },
  refresh: 'Refresh Data Scope',
  selectAll: (total: number) => `Select all data scopes (${total})`,
  loadingAll: 'Loading all data scopes...',
  searchPlaceholder: 'Search data scopes to add',
  selectedPlaceholder: 'Selected data scopes',
  cancel: 'Cancel',
  save: 'Save',
  add: 'Add Data Scope',
  error: {
    list: 'Failed to load data scopes.',
    search: 'Failed to search data scopes.',
    loadAll: 'Failed to load all data scopes.',
    initial: 'Failed to load some selected data scopes.',
  },
  initialLabelsLimited: 'Some selected data scope labels will appear after those scopes are loaded.',
};
