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

import dayjs from 'dayjs';

import { getCron, getCronOptions } from '@/config/cron';
import { IBPMode, type IBlueprint } from '@/types';
import { formatTime } from '@/utils/time';

import {
  COPY,
  CRON_FIELD_COUNT,
  CRON_SEPARATOR,
  CUSTOM_CRON_DEFAULT,
  FREQUENCY,
  NEXT_RUN_FORMAT,
  QUICK_RANGES,
  TIMEZONE_OFFSET_FORMAT,
  UTC_ISO_FORMAT,
} from './constants';
import type { QuickRange, SyncPolicyValues } from './types';

const DAY_FORMAT = 'YYYY-MM-DD';
const ZERO_OFFSET_MINUTES = '00';

type PolicySource = Pick<IBlueprint, 'mode' | 'timeAfter' | 'isManual' | 'cronConfig' | 'skipOnFail'>;

export const getFrequencyLabel = (isManual: boolean, cronConfig: string) => getCron(isManual, cronConfig).label;

export const getNextRunTime = (isManual: boolean, cronConfig: string) => getCron(isManual, cronConfig).nextTime;

export const getNextRuns = (isManual: boolean, cronConfig: string) =>
  getCron(isManual, cronConfig).nextTimes.map((time) =>
    COPY.frequency.nextRun(dayjs(time).format(NEXT_RUN_FORMAT), dayjs(time).fromNow()),
  );

export const formatFrequency = (isManual: boolean, cronConfig: string) => {
  const { label, description } = getCron(isManual, cronConfig);
  return [label, description].filter(Boolean).join(' ');
};

export const formatTimeRange = (mode: IBPMode, timeAfter: string | null) => {
  if (mode !== IBPMode.NORMAL) return COPY.summary.notAvailable;
  return timeAfter ? COPY.summary.toNow(formatTime(timeAfter)) : COPY.summary.allHistory;
};

export const formatSkipOnFail = (skipOnFail: boolean) => (skipOnFail ? COPY.summary.enabled : COPY.summary.disabled);

export const toSummaryItems = ({ mode, timeAfter, isManual, cronConfig, skipOnFail }: PolicySource) => [
  { label: COPY.summary.timeRange, value: formatTimeRange(mode, timeAfter) },
  { label: COPY.summary.frequency, value: formatFrequency(isManual, cronConfig) },
  { label: COPY.summary.skipOnFail, value: formatSkipOnFail(skipOnFail) },
];

export const toPolicyValues = ({ isManual, cronConfig, skipOnFail, timeAfter }: PolicySource): SyncPolicyValues => ({
  isManual,
  cronConfig,
  skipOnFail,
  timeAfter,
});

export const getFrequencyChoice = (isManual: boolean, cronConfig: string) => {
  if (isManual) return FREQUENCY.MANUAL;
  return getCronOptions().find((option) => option.value === cronConfig)?.label ?? FREQUENCY.CUSTOM;
};

export const getFrequencyPatch = (choice: string): Partial<SyncPolicyValues> => {
  if (choice === FREQUENCY.MANUAL) return { isManual: true };
  if (choice === FREQUENCY.CUSTOM) return { isManual: false, cronConfig: CUSTOM_CRON_DEFAULT };
  const preset = getCronOptions().find((option) => option.label === choice);
  return preset ? { isManual: false, cronConfig: preset.value } : {};
};

export const splitCron = (cronConfig: string) => {
  const fields = cronConfig.split(CRON_SEPARATOR);
  return Array.from({ length: CRON_FIELD_COUNT }, (_, index) => fields[index] ?? '');
};

export const setCronField = (cronConfig: string, index: number, value: string) =>
  splitCron(cronConfig)
    .map((field, position) => (position === index ? value : field))
    .join(CRON_SEPARATOR);

export const toUtcIso = (date: Date | string) => dayjs(date).utc().format(UTC_ISO_FORMAT);

export const getQuickRanges = (now: Date = new Date()): QuickRange[] =>
  QUICK_RANGES.map(({ key, label, amount, unit }) => ({
    key,
    label,
    date: dayjs(now).subtract(amount, unit).toDate(),
  }));

export const findQuickRange = (ranges: QuickRange[], timeAfter: string | null) =>
  timeAfter ? ranges.find(({ date }) => formatTime(date, DAY_FORMAT) === formatTime(timeAfter, DAY_FORMAT)) : undefined;

export const getTimezoneLabel = () => dayjs().format(TIMEZONE_OFFSET_FORMAT).replace(ZERO_OFFSET_MINUTES, '');
