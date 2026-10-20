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

import type { OtelConnectionResponse } from '@/api/otel';

import { SETTINGS_OPTION, STORAGE_PER_DEVELOPER } from './constants';
import type { SettingsOption, SettingsSelection, StorageEstimate } from './types';

type ManagedSettings = NonNullable<OtelConnectionResponse['managedSettings']>;
type EnvMap = Record<string, string>;

const SIGNALS: SettingsOption[] = [SETTINGS_OPTION.METRICS, SETTINGS_OPTION.LOGS];

const ENV = {
  METRICS_EXPORTER: 'OTEL_METRICS_EXPORTER',
  LOGS_EXPORTER: 'OTEL_LOGS_EXPORTER',
  METRIC_EXPORT_INTERVAL: 'OTEL_METRIC_EXPORT_INTERVAL',
  LOG_USER_PROMPTS: 'OTEL_LOG_USER_PROMPTS',
  LOG_TOOL_DETAILS: 'OTEL_LOG_TOOL_DETAILS',
  INCLUDE_REPOSITORY: 'OTEL_METRICS_INCLUDE_REPOSITORY',
} as const;

const EXPORTER_NONE = 'none';
const FLAG_OFF = '0';
const BOOL_FALSE = 'false';

const OFF_EFFECTS: Record<SettingsOption, (env: EnvMap) => void> = {
  [SETTINGS_OPTION.METRICS]: (env) => {
    env[ENV.METRICS_EXPORTER] = EXPORTER_NONE;
    delete env[ENV.METRIC_EXPORT_INTERVAL];
  },
  [SETTINGS_OPTION.LOGS]: (env) => {
    env[ENV.LOGS_EXPORTER] = EXPORTER_NONE;
  },
  [SETTINGS_OPTION.PROMPT_TEXT]: (env) => {
    env[ENV.LOG_USER_PROMPTS] = FLAG_OFF;
  },
  [SETTINGS_OPTION.TOOL_DETAILS]: (env) => {
    env[ENV.LOG_TOOL_DETAILS] = FLAG_OFF;
  },
  [SETTINGS_OPTION.REPOSITORY]: (env) => {
    env[ENV.INCLUDE_REPOSITORY] = BOOL_FALSE;
  },
};

export const isLastSignal = (selection: SettingsSelection, option: SettingsOption) =>
  SIGNALS.includes(option) && selection[option] && SIGNALS.filter((signal) => selection[signal]).length === 1;

export const buildManagedSettings = (
  base: ManagedSettings | undefined,
  selection: SettingsSelection,
): ManagedSettings | undefined => {
  if (!base) {
    return undefined;
  }
  const env = { ...base.env };
  (Object.keys(OFF_EFFECTS) as SettingsOption[]).forEach((option) => {
    if (!selection[option]) {
      OFF_EFFECTS[option](env);
    }
  });
  return { ...base, env };
};

export const storageFor = (option: SettingsOption): StorageEstimate => STORAGE_PER_DEVELOPER[option];

export const estimateStorage = (selection: SettingsSelection): StorageEstimate =>
  (Object.keys(selection) as SettingsOption[])
    .filter((option) => selection[option])
    .reduce(
      (total, option) => ({
        rawMb: total.rawMb + storageFor(option).rawMb,
        monthlyMb: total.monthlyMb + storageFor(option).monthlyMb,
      }),
      { rawMb: 0, monthlyMb: 0 },
    );
