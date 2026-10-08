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

export const PIPELINE_COLUMN = {
  ID: 'id',
  BLUEPRINT: 'name',
  STATUS: 'status',
  STARTED_AT: 'beganAt',
  COMPLETED_AT: 'finishedAt',
  DURATION: 'duration',
  ACTION: 'action',
} as const;

export const PIPELINE_ROW_ACTION = {
  CONFIGURATION: 'configuration',
  DOWNLOAD_LOGS: 'downloadLogs',
  DETAIL: 'detail',
} as const;

export const STAGE_STATE = {
  LOADING: 'loading',
  SUCCESS: 'success',
  ERROR: 'error',
  CANCEL: 'cancel',
  READY: 'ready',
} as const;

export const FILTER_PARAM = { BLUEPRINT: 'blueprintId' } as const;
export const BLUEPRINT_OPTIONS_LIMIT = 100;
export const BLUEPRINT_SEARCH_DEBOUNCE_MS = 300;
export const BLUEPRINT_TYPE_ALL = 'ALL';
export const LOGS_FILE_NAME = 'logging.tar.gz';
export const PICKED_CONFIG_FIELDS = ['id', 'name', 'plan', 'skipOnFail'] as const;

export const COPY = {
  title: 'Pipelines',
  detailTitle: (id: string) => `Pipeline ${id}`,
  breadcrumbAdvanced: 'Advanced',
  tableLabel: 'Pipelines',
  blueprintFilter: { label: 'Blueprint', placeholder: 'All blueprints' },
  columns: {
    id: 'ID',
    blueprint: 'Blueprint name',
    status: 'Status',
    startedAt: 'Started at',
    completedAt: 'Completed at',
    duration: 'Duration',
    action: 'Action',
  },
  noValue: '-',
  rowActions: {
    label: (id: string | number) => `Actions for pipeline ${id}`,
    configuration: 'Configuration',
    downloadLogs: 'Download Logs',
    detail: 'Detail',
  },
  drawer: {
    title: (id: string | number) => `Pipeline ${id}`,
    heading: 'JSON Configurations',
    description: "This is the configuration format used in a Blueprint's Advanced Mode.",
    mime: 'application/json',
    copy: 'Copy configuration',
  },
  empty: {
    title: 'No pipelines yet',
    description: 'Pipelines appear here after a blueprint runs.',
  },
  noResults: {
    title: 'No pipelines match this blueprint',
    description: 'Pick another blueprint, or clear the filter.',
  },
  summary: {
    label: 'Pipeline summary',
    status: 'Status',
    startedAt: 'Started at',
    duration: 'Duration',
    stage: 'Current stage',
    tasks: 'Tasks',
    tasksValue: (finished: number, total: number) => `${finished} / ${total} completed`,
    failed: 'Pipeline failed. Hover over a failed task below to see the reason.',
    cancel: 'Cancel pipeline',
    rerun: 'Rerun pipeline',
  },
  stage: {
    label: (key: string | number) => `Stage ${key}`,
    failedCount: (failed: number, total: number) => `${failed} of ${total} tasks failed`,
    state: {
      [STAGE_STATE.SUCCESS]: 'Complete',
      [STAGE_STATE.LOADING]: 'In progress',
      [STAGE_STATE.ERROR]: 'Failed',
      [STAGE_STATE.CANCEL]: 'Cancelled',
      [STAGE_STATE.READY]: 'Pending',
    } satisfies Record<(typeof STAGE_STATE)[keyof typeof STAGE_STATE], string>,
  },
  task: {
    label: (id: string | number) => `Task${id}`,
    pending: 'Pending',
    failed: 'Failed',
    cancelled: 'Cancelled',
    subtasks: (finished: number, total: number) => `${finished} of ${total} subtasks`,
    rerun: 'Rerun task',
  },
  detail: { title: (id: string | number) => `Pipeline ${id} details` },
  loading: 'Loading pipeline',
  actions: {
    cancelled: 'Pipeline cancelled.',
    cancelFailed: 'The pipeline could not be cancelled. Try again in a moment.',
    rerunStarted: 'Rerun started.',
    rerunFailed: 'The rerun could not be started. Try again in a moment.',
    rerunBusy: 'This pipeline has nothing to rerun right now. Wait for running tasks to finish and try again.',
    taskRerunStarted: 'Task rerun started.',
    taskRerunFailed: 'The task could not be rerun. Try again in a moment.',
  },
};

const HTTP_BAD_REQUEST = '400';

export const RERUN_ERROR_MAP: Record<string, string> = { [HTTP_BAD_REQUEST]: COPY.actions.rerunBusy };

export const TASK_CELL = {
  PENDING: 'pending',
  PROGRESS: 'progress',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;
