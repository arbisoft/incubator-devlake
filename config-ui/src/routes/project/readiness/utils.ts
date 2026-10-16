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

import type { ComplianceScorecardRow } from '@/api/compliance-scorecard';

import {
  AVAILABLE_MARKER,
  COPY,
  MISSING_MARKER,
  PERCENT_PATTERN,
  SIGNAL_FIELD,
  SIGNAL_ORDER,
  SIGNAL_STATE,
  SOURCE_SEPARATOR,
} from './constants';
import type { ProjectReadiness, ReadinessSignal, ReadinessSignalKey } from './types';

const readText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const toSignal = (key: ReadinessSignalKey, raw: unknown): ReadinessSignal => {
  const text = readText(raw);
  if (text.startsWith(AVAILABLE_MARKER)) {
    const sources = text
      .slice(AVAILABLE_MARKER.length)
      .split(SOURCE_SEPARATOR)
      .map((source) => source.trim())
      .filter(Boolean);
    return { key, state: SIGNAL_STATE.AVAILABLE, sources };
  }
  if (text.startsWith(MISSING_MARKER)) return { key, state: SIGNAL_STATE.MISSING, sources: [] };
  return { key, state: SIGNAL_STATE.UNKNOWN, sources: [] };
};

export const formatPercent = (raw: unknown): string | null => {
  const match = readText(raw).match(PERCENT_PATTERN);
  return match ? `${Number(match[0])}%` : null;
};

export const toReadiness = (row: ComplianceScorecardRow): ProjectReadiness => {
  const signals = SIGNAL_ORDER.map((key) => toSignal(key, row[SIGNAL_FIELD[key]]));
  return {
    project: row.Project,
    signals,
    available: signals.filter(({ state }) => state === SIGNAL_STATE.AVAILABLE).length,
    total: signals.length,
    percentLabel: formatPercent(row.Compliance),
  };
};

export const toReadinessMap = (rows: ComplianceScorecardRow[] = []): Map<string, ProjectReadiness> =>
  new Map(
    rows
      .filter((row) => typeof row?.Project === 'string' && row.Project !== '')
      .map((row) => [row.Project, toReadiness(row)] as const),
  );

export const getMissingHint = ({ signals }: ProjectReadiness): string | null => {
  const missing = signals
    .filter(({ state }) => state === SIGNAL_STATE.MISSING)
    .map(({ key }) => COPY.signals[key].missing);
  return missing.length === 0 ? null : COPY.missingHint(missing);
};
