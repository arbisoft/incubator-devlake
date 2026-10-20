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

import { SettingOption } from '@/ui';

import { isLastSignal, SETTINGS_OPTION, type SettingsOption } from '../managed-settings';
import { Hint } from '../styled';
import type { SettingsOptionsProps } from '../types';

import { COPY } from './constants';

const OPTIONS: { option: SettingsOption; children?: SettingsOption[] }[] = [
  { option: SETTINGS_OPTION.METRICS },
  { option: SETTINGS_OPTION.LOGS, children: [SETTINGS_OPTION.PROMPT_TEXT] },
  { option: SETTINGS_OPTION.TOOL_DETAILS },
  { option: SETTINGS_OPTION.REPOSITORY },
];

export const SettingsOptions = ({ value, onChange }: SettingsOptionsProps) => {
  const renderOption = (option: SettingsOption, children?: SettingsOption[]) => (
    <SettingOption
      key={option}
      label={COPY.snippet.options[option].label}
      description={COPY.snippet.options[option].description}
      checked={value[option]}
      disabled={isLastSignal(value, option)}
      onChange={(checked) => onChange({ ...value, [option]: checked })}
    >
      {value[option] && children?.map((child) => renderOption(child))}
    </SettingOption>
  );

  return (
    <>
      <div role="group" aria-label={COPY.snippet.options.title}>
        {OPTIONS.map(({ option, children }) => renderOption(option, children))}
      </div>
      {OPTIONS.some(({ option }) => isLastSignal(value, option)) && <Hint>{COPY.snippet.options.lastSignal}</Hint>}
    </>
  );
};
