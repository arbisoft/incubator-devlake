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

import { trimSlashes, trimTrailingSlashes } from '@/utils';

export interface ScopeData {
  prefix?: string;
  year?: number;
  month?: number | null;
  basePath?: string;
  accountId?: string;
}

export interface ScopeItem {
  id: string;
  name: string;
  fullName: string;
  data?: ScopeData;
}

export const normalizeBasePath = (value: string) => trimSlashes(value.trim());

const readMonth = (segments: string[], data: ScopeData): number | null => {
  if (data.month !== undefined && data.month !== null) return data.month;
  const last = segments[segments.length - 1];
  return last && /^(0[1-9]|1[0-2])$/.test(last) ? Number(last) : null;
};

const readYear = (segments: string[], data: ScopeData, month: number | null): number | undefined => {
  if (data.year !== undefined && data.year !== null) return data.year;
  const idx = month ? segments.length - 2 : segments.length - 1;
  const candidate = idx >= 0 ? segments[idx] : undefined;
  return candidate && /^\d{4}$/.test(candidate) ? Number(candidate) : undefined;
};

const readBaseSegments = (segments: string[], month: number | null): string[] => {
  if (segments.length === 0) return [];
  return segments.slice(0, Math.max(segments.length - (month ? 2 : 1), 0));
};

export const extractScopeMeta = (item: ScopeItem) => {
  const data = item.data ?? {};
  const rawPrefix = data.prefix ?? item.fullName ?? item.id;
  const prefix = typeof rawPrefix === 'string' ? trimTrailingSlashes(rawPrefix) : '';
  const segments = prefix ? prefix.split('/').filter(Boolean) : [];

  const month = readMonth(segments, data);
  const year = readYear(segments, data, month);
  const baseSegments = readBaseSegments(segments, month);
  const basePath = normalizeBasePath(data.basePath ?? (baseSegments.length ? baseSegments.join('/') : ''));

  return {
    basePath,
    year: typeof year === 'number' ? year : null,
    month,
    prefix,
    accountId: data.accountId ?? '',
  };
};
