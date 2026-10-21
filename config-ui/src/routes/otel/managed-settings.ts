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

import { SETTINGS_OPTION, SETTINGS_OPTION_META } from './settings-option-constants';
import type { ManagedSettings, SettingsOption, SettingsSelection, StorageEstimate } from './types';

const options = Object.values(SETTINGS_OPTION);
const signals = options.filter((option) => SETTINGS_OPTION_META[option].isSignal);
export const childrenOf = (option: SettingsOption): readonly SettingsOption[] =>
  SETTINGS_OPTION_META[option].children ?? [];

const parentOf = new Map<SettingsOption, SettingsOption>(
  options.flatMap((parent) => childrenOf(parent).map((child) => [child, parent] as const)),
);

const selectionFrom = (isOn: (option: SettingsOption) => boolean): SettingsSelection =>
  Object.fromEntries(options.map((option) => [option, isOn(option)])) as SettingsSelection;

export const DEFAULT_SETTINGS_SELECTION = selectionFrom((option) => SETTINGS_OPTION_META[option].defaultOn);
export const TOP_LEVEL_OPTIONS = options.filter((option) => !parentOf.has(option));

const effectiveSelection = (selection: SettingsSelection): SettingsSelection =>
  selectionFrom((option) => {
    const parent = parentOf.get(option);
    return selection[option] && (parent === undefined || selection[parent]);
  });

export const hasSingleSignal = (selection: SettingsSelection) =>
  signals.filter((signal) => selection[signal]).length === 1;

export const isLastSignal = (selection: SettingsSelection, option: SettingsOption) =>
  signals.includes(option) && selection[option] && hasSingleSignal(selection);

export const buildManagedSettings = (
  base: ManagedSettings | undefined,
  selection: SettingsSelection,
): ManagedSettings | undefined => {
  if (!base || !signals.some((signal) => selection[signal])) {
    return undefined;
  }
  const env: Record<string, string> = { ...base.env };
  const effective = effectiveSelection(selection);
  options
    .filter((option) => !effective[option])
    .forEach((option) => {
      const { set, remove = [] } = SETTINGS_OPTION_META[option].offEnv;
      Object.assign(env, set);
      remove.forEach((key) => delete env[key]);
    });
  return { ...base, env };
};

export const storageFor = (option: SettingsOption): StorageEstimate => SETTINGS_OPTION_META[option].storage;

export const estimateStorage = (selection: SettingsSelection): StorageEstimate => {
  const effective = effectiveSelection(selection);
  return options
    .filter((option) => effective[option])
    .reduce(
      (total, option) => ({
        rawMb: total.rawMb + storageFor(option).rawMb,
        monthlyMb: total.monthlyMb + storageFor(option).monthlyMb,
      }),
      { rawMb: 0, monthlyMb: 0 },
    );
};
