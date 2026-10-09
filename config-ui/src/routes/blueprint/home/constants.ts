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

import { STATUS_TONE } from '@/ui/constants';

export const BLUEPRINT_COLUMN = {
  NAME: 'name',
  CONNECTIONS: 'connections',
  FREQUENCY: 'frequency',
  NEXT_RUN: 'nextRunTime',
  PROJECT: 'project',
  STATUS: 'enable',
  ACTION: 'action',
} as const;

export const STATUS_FILTER = { ALL: 'all', ENABLED: 'enabled', DISABLED: 'disabled' } as const;
export const TYPE_FILTER_ALL = 'all';
export const LIST_FILTER = { TYPE: 'type', STATUS: 'status' } as const;

export const BLUEPRINT_STATUS_TONE = {
  [STATUS_FILTER.ENABLED]: STATUS_TONE.NEUTRAL,
  [STATUS_FILTER.DISABLED]: STATUS_TONE.ERROR,
} as const;

export const MAX_VISIBLE_CONNECTIONS = 2;
export const CONFIGURATION_TAB_STATE = { activeKey: 'configuration' } as const;

export const COPY = {
  title: 'Blueprints',
  tableLabel: 'Blueprints',
  description: 'This is a complete list of all Blueprints you have created, whether they belong to Projects or not.',
  breadcrumbAdvanced: 'Advanced',
  searchPlaceholder: 'Search blueprints',
  statusFilterLabel: 'Status',
  typeFilterLabel: 'Frequency',
  statusFilter: {
    [STATUS_FILTER.ALL]: 'All',
    [STATUS_FILTER.ENABLED]: 'Enabled',
    [STATUS_FILTER.DISABLED]: 'Disabled',
  },
  allTypes: 'All',
  newBlueprint: 'New blueprint',
  columns: {
    name: 'Blueprint name',
    connections: 'Data connections',
    frequency: 'Frequency',
    nextRun: 'Next run time',
    project: 'Project',
    status: 'Status',
    action: 'Action',
  },
  advancedMode: 'Advanced Mode',
  notAvailable: 'N/A',
  moreConnections: (count: number) => `+${count} more`,
  configure: 'Blueprint Configuration',
  empty: {
    title: 'No blueprints yet',
    description: 'Create a blueprint to schedule data collection, or add a project to get one automatically.',
  },
  noResults: {
    title: 'No blueprints match your filters',
    description: 'Try a different name, status or frequency.',
  },
  create: {
    title: 'Create Blueprint',
    submit: 'Save',
    disabledReason: 'Enter a blueprint name.',
    name: {
      label: 'Blueprint name',
      description: 'Give the Blueprint a unique name so you can identify it later.',
      placeholder: 'Your Blueprint Name',
    },
    mode: {
      label: 'Blueprint mode',
      description:
        'Normal Mode suits most cases. Use Advanced Mode if you need to customize how the Blueprint runs its tasks.',
      normal: 'Normal Mode',
      advanced: 'Advanced Mode',
    },
  },
};
