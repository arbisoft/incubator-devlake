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

import { SETTINGS_OPTION } from './constants';
import type { ManagedSettings, OptionMeta, SettingsOption, SettingsSelection, StorageEstimate } from './types';

const SETTINGS_OPTION_META: Record<SettingsOption, OptionMeta> = {
  [SETTINGS_OPTION.METRICS]: { isSignal: true, defaultOn: true, storage: { rawMb: 20, monthlyMb: 1 } },
  [SETTINGS_OPTION.LOGS]: {
    isSignal: true,
    defaultOn: true,
    storage: { rawMb: 42, monthlyMb: 17 },
    children: [SETTINGS_OPTION.PROMPT_TEXT, SETTINGS_OPTION.TOOL_DETAILS, SETTINGS_OPTION.REPOSITORY],
  },
  [SETTINGS_OPTION.PROMPT_TEXT]: { isSignal: false, defaultOn: true, storage: { rawMb: 1, monthlyMb: 0 } },
  [SETTINGS_OPTION.TOOL_DETAILS]: { isSignal: false, defaultOn: true, storage: { rawMb: 0, monthlyMb: 0 } },
  [SETTINGS_OPTION.REPOSITORY]: { isSignal: false, defaultOn: true, storage: { rawMb: 10, monthlyMb: 3 } },
};

type EnvMap = Record<string, string>;

const OPTIONS = Object.values(SETTINGS_OPTION);
const SIGNALS = OPTIONS.filter((option) => SETTINGS_OPTION_META[option].isSignal);
export const childrenOf = (option: SettingsOption): readonly SettingsOption[] =>
  SETTINGS_OPTION_META[option].children ?? [];

const PARENT_OF = new Map<SettingsOption, SettingsOption>(
  OPTIONS.flatMap((parent) => childrenOf(parent).map((child) => [child, parent] as const)),
);

const selectionFrom = (isOn: (option: SettingsOption) => boolean): SettingsSelection =>
  Object.fromEntries(OPTIONS.map((option) => [option, isOn(option)])) as SettingsSelection;

export const DEFAULT_SETTINGS_SELECTION = selectionFrom((option) => SETTINGS_OPTION_META[option].defaultOn);
export const TOP_LEVEL_OPTIONS = OPTIONS.filter((option) => !PARENT_OF.has(option));

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

export const effectiveSelection = (selection: SettingsSelection): SettingsSelection =>
  selectionFrom((option) => {
    const parent = PARENT_OF.get(option);
    return selection[option] && (parent === undefined || selection[parent]);
  });

export const hasSingleSignal = (selection: SettingsSelection) =>
  SIGNALS.filter((signal) => selection[signal]).length === 1;

export const isLastSignal = (selection: SettingsSelection, option: SettingsOption) =>
  SIGNALS.includes(option) && selection[option] && hasSingleSignal(selection);

export const buildManagedSettings = (
  base: ManagedSettings | undefined,
  selection: SettingsSelection,
): ManagedSettings | undefined => {
  if (!base || !SIGNALS.some((signal) => selection[signal])) {
    return undefined;
  }
  const env = { ...base.env };
  const effective = effectiveSelection(selection);
  OPTIONS.forEach((option) => {
    if (!effective[option]) {
      OFF_EFFECTS[option](env);
    }
  });
  return { ...base, env };
};

export const storageFor = (option: SettingsOption): StorageEstimate => SETTINGS_OPTION_META[option].storage;

export const estimateStorage = (selection: SettingsSelection): StorageEstimate => {
  const effective = effectiveSelection(selection);
  return OPTIONS.filter((option) => effective[option]).reduce(
    (total, option) => ({
      rawMb: total.rawMb + storageFor(option).rawMb,
      monthlyMb: total.monthlyMb + storageFor(option).monthlyMb,
    }),
    { rawMb: 0, monthlyMb: 0 },
  );
};
