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

import type { OptionMeta, SettingsOption } from './types';

export const SETTINGS_OPTION = {
  METRICS: 'metrics',
  LOGS: 'logs',
  PROMPT_TEXT: 'promptText',
  TOOL_DETAILS: 'toolDetails',
  REPOSITORY: 'repository',
} as const;

export const MANAGED_ENV_KEY = {
  METRICS_EXPORTER: 'OTEL_METRICS_EXPORTER',
  LOGS_EXPORTER: 'OTEL_LOGS_EXPORTER',
  METRIC_EXPORT_INTERVAL: 'OTEL_METRIC_EXPORT_INTERVAL',
  LOG_USER_PROMPTS: 'OTEL_LOG_USER_PROMPTS',
  LOG_TOOL_DETAILS: 'OTEL_LOG_TOOL_DETAILS',
  INCLUDE_REPOSITORY: 'OTEL_METRICS_INCLUDE_REPOSITORY',
} as const;

export const SETTINGS_OPTION_META: Record<SettingsOption, OptionMeta> = {
  [SETTINGS_OPTION.METRICS]: {
    isSignal: true,
    defaultOn: true,
    storage: { rawMb: 20, monthlyMb: 1 },
    offEnv: {
      set: { [MANAGED_ENV_KEY.METRICS_EXPORTER]: 'none' },
      remove: [MANAGED_ENV_KEY.METRIC_EXPORT_INTERVAL],
    },
  },
  [SETTINGS_OPTION.LOGS]: {
    isSignal: true,
    defaultOn: true,
    storage: { rawMb: 42, monthlyMb: 17 },
    children: [SETTINGS_OPTION.PROMPT_TEXT, SETTINGS_OPTION.TOOL_DETAILS, SETTINGS_OPTION.REPOSITORY],
    offEnv: { set: { [MANAGED_ENV_KEY.LOGS_EXPORTER]: 'none' } },
  },
  [SETTINGS_OPTION.PROMPT_TEXT]: {
    isSignal: false,
    defaultOn: true,
    storage: { rawMb: 1, monthlyMb: 0 },
    offEnv: { set: { [MANAGED_ENV_KEY.LOG_USER_PROMPTS]: '0' } },
  },
  [SETTINGS_OPTION.TOOL_DETAILS]: {
    isSignal: false,
    defaultOn: true,
    storage: { rawMb: 0, monthlyMb: 0 },
    offEnv: { set: { [MANAGED_ENV_KEY.LOG_TOOL_DETAILS]: '0' } },
  },
  [SETTINGS_OPTION.REPOSITORY]: {
    isSignal: false,
    defaultOn: true,
    storage: { rawMb: 10, monthlyMb: 3 },
    offEnv: { set: { [MANAGED_ENV_KEY.INCLUDE_REPOSITORY]: 'false' } },
  },
};
