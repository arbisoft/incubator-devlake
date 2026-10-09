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

export const ACTIVITY_COLUMN = {
  WHEN: 'when',
  ACTION: 'action',
  ACTOR: 'actor',
  TARGET: 'target',
  DETAIL: 'detail',
} as const;

export const COPY = {
  title: 'Recent Activities',
  description: 'Recent changes to who can access DevLake.',
  sectionTitle: 'Access log',
  tableLabel: 'Recent access activity',
  searchPlaceholder: 'Search activity',
  columns: { when: 'When', action: 'Action', actor: 'Actor', target: 'Target', detail: 'Detail' },
  system: 'System',
  empty: { title: 'No activity yet', description: 'Changes to access settings will appear here.' },
  noResults: { title: 'No activity matches your search', description: 'Try a different action, person or detail.' },
  openEvent: (action: string, when: string) => `Open ${action} at ${when}`,
  drawer: {
    title: 'Activity detail',
    output: 'Output',
    copy: 'Copy JSON',
    close: 'Close',
  },
};
