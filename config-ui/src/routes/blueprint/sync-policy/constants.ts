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

import { cronPresets } from '@/config/cron';

export const [DEFAULT_PRESET] = cronPresets;

export const FREQUENCY = { MANUAL: 'Manual', CUSTOM: 'Custom' } as const;

export const CUSTOM_CRON_DEFAULT = '* * * * *';
export const CRON_SEPARATOR = ' ';
export const CRON_FIELD_COUNT = 5;
export const NEXT_RUN_FORMAT = 'YYYY-MM-DD HH:mm A';
export const UTC_ISO_FORMAT = 'YYYY-MM-DD[T]HH:mm:ssZ';
export const TIMEZONE_OFFSET_FORMAT = 'ZZ';

export const QUICK_RANGES = [
  { key: 'sixMonths', label: 'Last 6 months', amount: 6, unit: 'month' },
  { key: 'ninetyDays', label: 'Last 90 days', amount: 90, unit: 'day' },
  { key: 'thirtyDays', label: 'Last 30 days', amount: 30, unit: 'day' },
  { key: 'year', label: 'Last Year', amount: 1, unit: 'year' },
] as const;

export const COPY = {
  summary: {
    timeRange: 'Data time range',
    frequency: 'Sync frequency',
    skipOnFail: 'Skip failed tasks',
    toNow: (start: string) => `${start} to Now`,
    allHistory: 'All history to Now',
    notAvailable: 'N/A',
    enabled: 'Enabled',
    disabled: 'Disabled',
  },
  modal: { title: 'Set sync policy', submit: 'Save' },
  timezone: {
    prefix: 'Your local time zone is',
    suffix: 'All time listed below is shown in your local time.',
    zone: (offset: string) => `UTC ${offset}`,
  },
  timeRange: {
    label: 'Time range',
    description:
      'Select the start date for the data you wish to collect. DevLake will collect all available history by default unless you configure a start date.',
    quickLabel: 'Quick time range',
    placeholder: 'Select start from',
    toNow: 'to Now',
  },
  frequency: {
    label: 'Sync frequency',
    description: 'Blueprints will run on creation and recurringly based on the schedule.',
    custom: { minute: 'Minute', hour: 'Hour', day: 'Day', month: 'Month', week: 'Week' },
    invalid: 'Invalid cron code, please enter again.',
    helpLink: 'Learn how to use cron code',
    or: 'or',
    aiLink: 'auto-convert English to cron code',
    nextRuns: 'Next three runs',
    notAvailable: 'N/A',
    nextRun: (time: string, relative: string) => `${time} (${relative})`,
  },
  policy: {
    label: 'Running policy',
    skipOnFail:
      'Skip failed tasks (Recommended when collecting a large volume of data, eg. 10+ GitHub repos, Jira boards, etc.)',
    skipOnFailHint:
      'A task is a unit of a pipeline, an execution of a blueprint. By default, when a task is failed, the whole pipeline will fail and all the data that has been collected will be discarded. By skipping failed tasks, the pipeline will continue to run, and the data collected by successful tasks will not be affected. After the pipeline is finished, you can rerun these failed tasks.',
  },
};

export const CUSTOM_CRON_FIELDS = [
  COPY.frequency.custom.minute,
  COPY.frequency.custom.hour,
  COPY.frequency.custom.day,
  COPY.frequency.custom.month,
  COPY.frequency.custom.week,
] as const;
