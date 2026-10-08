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

import { formatTime } from '@/utils/time';

import { COMMON_COPY, DATE_TIME_FORMAT, MS_PER_SECOND, RELATIVE_NOW_SECONDS } from './constants';

type TimeInput = Date | string | number | null | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isCode = (value: unknown): value is string | number => typeof value === 'string' || typeof value === 'number';

const errorCodes = (error: unknown): string[] => {
  if (!isRecord(error)) return [];
  const response = isRecord(error.response) ? error.response : undefined;
  const data = response && isRecord(response.data) ? response.data : undefined;
  return [data?.code, response?.status, error.code].filter(isCode).map(String);
};

// Never echoes the raw error message: only mapped copy or the fallback reaches the user.
export const toUserMessage = (error: unknown, map: Record<string, string>, fallback = COMMON_COPY.genericError) => {
  const hit = errorCodes(error).find((code) => map[code]);
  return hit ? map[hit] : fallback;
};

export const formatDateTime = (value: TimeInput, format = DATE_TIME_FORMAT) =>
  value === null || value === undefined ? COMMON_COPY.emptyValue : formatTime(new Date(value), format);

export const formatRelativeTime = (value: TimeInput, now: Date | number = Date.now()) => {
  if (value === null || value === undefined) return COMMON_COPY.emptyValue;
  const seconds = Math.abs(dayjs(now).diff(value)) / MS_PER_SECOND;
  return seconds < RELATIVE_NOW_SECONDS ? COMMON_COPY.justNow : dayjs(value).from(now);
};
