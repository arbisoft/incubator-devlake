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

export const PROJECT_COLUMN = {
  NAME: 'name',
  CONNECTIONS: 'connections',
  FREQUENCY: 'frequency',
  CREATED_AT: 'createdAt',
  LAST_RUN_AT: 'lastRunAt',
  LAST_RUN_STATUS: 'lastRunStatus',
  ACTION: 'action',
} as const;

export const PROJECT_METRICS = [
  { pluginName: 'dora', pluginOption: {}, enable: true },
  { pluginName: 'issue_trace', pluginOption: {}, enable: true },
];

export const NO_CONNECTIONS = 'N/A';
export const MAX_VISIBLE_CONNECTIONS = 2;
export const CONNECTION_ENTRY_KIND = { PLUGIN: 'plugin', OTEL: 'otel' } as const;

export const COPY = {
  title: 'Projects',
  tableLabel: 'Projects',
  searchPlaceholder: 'Search projects',
  newProject: 'New project',
  columns: {
    name: 'Project name',
    connections: 'Data connections',
    frequency: 'Sync frequency',
    createdAt: 'Created at',
    lastRunAt: 'Last run completed at',
    lastRunStatus: 'Last run status',
    action: 'Action',
  },
  noConnections: NO_CONNECTIONS,
  moreConnections: (count: number) => `+${count} more`,
  configure: 'Project Configuration',
  empty: {
    title: 'No projects yet',
    description: 'Create a project to start collecting and analysing your engineering data.',
  },
  noResults: {
    title: 'No projects match your search',
    description: 'Try a different project name.',
  },
  create: {
    title: 'Create a New Project',
    submit: 'Save',
    disabledReason: 'Enter a project name.',
    name: {
      label: 'Project name',
      description: 'Give your project a unique name with letters, numbers, -, _ or /',
      placeholder: 'Your Project Name',
    },
  },
};
