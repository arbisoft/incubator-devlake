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

export const READINESS_SIGNAL = { ISSUE: 'issue', PR: 'pr', AI: 'ai' } as const;
export const SIGNAL_STATE = { AVAILABLE: 'available', MISSING: 'missing', UNKNOWN: 'unknown' } as const;

export const SIGNAL_ORDER = [READINESS_SIGNAL.ISSUE, READINESS_SIGNAL.PR, READINESS_SIGNAL.AI] as const;

export const SIGNAL_FIELD = {
  [READINESS_SIGNAL.ISSUE]: 'Issue Visibility',
  [READINESS_SIGNAL.PR]: 'PR Visibility',
  [READINESS_SIGNAL.AI]: 'AI Visibility',
} as const;

export const AVAILABLE_MARKER = '✅';
export const MISSING_MARKER = '❌';
export const SOURCE_SEPARATOR = ', ';
export const PERCENT_PATTERN = /\d+(?:\.\d+)?/;

export const COPY = {
  title: 'DevLake readiness',
  signals: {
    [READINESS_SIGNAL.ISSUE]: {
      name: 'Issue visibility',
      description: 'Issues and their status history. Used for lead time and incident metrics.',
      missing: 'an issue tracker',
    },
    [READINESS_SIGNAL.PR]: {
      name: 'PR visibility',
      description: 'Pull requests and reviews. Used for review time and throughput.',
      missing: 'a code host',
    },
    [READINESS_SIGNAL.AI]: {
      name: 'AI visibility',
      description: 'AI coding tool telemetry. Used for AI-assisted delivery metrics.',
      missing: 'an AI tool',
    },
  },
  state: {
    [SIGNAL_STATE.AVAILABLE]: 'Available',
    [SIGNAL_STATE.MISSING]: 'Not available',
    [SIGNAL_STATE.UNKNOWN]: 'Unknown',
  },
  notAvailable: 'Not available',
  unknown: 'Unknown',
  summary: (available: number, total: number) => `${available} of ${total} signals available`,
  addConnection: 'Add connection',
  missingHint: (names: string[]) => {
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
    return `Connect ${list} to reach 100%.`;
  },
};
