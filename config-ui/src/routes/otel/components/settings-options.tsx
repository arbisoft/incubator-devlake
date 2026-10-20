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

import { Alert } from 'antd';

import { HelpPopover, SettingOption } from '@/ui';

import { estimateStorage, isLastSignal, SETTINGS_OPTION, type SettingsOption, storageFor } from '../managed-settings';
import { Hint, HelpDetails } from '../styled';
import type { OptionHelpProps, SettingsOptionsProps } from '../types';

import { COPY } from './constants';

const OPTIONS_COPY = COPY.snippet.options;

const OPTIONS: { option: SettingsOption; children?: SettingsOption[] }[] = [
  { option: SETTINGS_OPTION.METRICS },
  { option: SETTINGS_OPTION.LOGS, children: [SETTINGS_OPTION.PROMPT_TEXT] },
  { option: SETTINGS_OPTION.TOOL_DETAILS },
  { option: SETTINGS_OPTION.REPOSITORY },
];

const OptionHelp = ({ option }: OptionHelpProps) => {
  const { rawMb, monthlyMb } = storageFor(option);
  return (
    <HelpDetails>
      <ul>
        {OPTIONS_COPY[option].details.map((detail) => (
          <li key={detail}>{detail}</li>
        ))}
      </ul>
      <span>{rawMb > 0 ? OPTIONS_COPY.storage(rawMb, monthlyMb) : OPTIONS_COPY.storageNone}</span>
    </HelpDetails>
  );
};

export const SettingsOptions = ({ value, onChange }: SettingsOptionsProps) => {
  const renderOption = (option: SettingsOption, children?: SettingsOption[]) => (
    <SettingOption
      key={option}
      label={OPTIONS_COPY[option].label}
      description={OPTIONS_COPY[option].description}
      aside={
        <HelpPopover label={OPTIONS_COPY.help(OPTIONS_COPY[option].label)} content={<OptionHelp option={option} />} />
      }
      checked={value[option]}
      disabled={isLastSignal(value, option)}
      onChange={(checked) => onChange({ ...value, [option]: checked })}
    >
      {value[option] && children?.map((child) => renderOption(child))}
    </SettingOption>
  );

  const { rawMb, monthlyMb } = estimateStorage(value);

  return (
    <>
      <div role="group" aria-label={OPTIONS_COPY.title}>
        {OPTIONS.map(({ option, children }) => renderOption(option, children))}
      </div>
      {OPTIONS.some(({ option }) => isLastSignal(value, option)) && <Hint>{OPTIONS_COPY.lastSignal}</Hint>}
      <Alert type="info" showIcon title={OPTIONS_COPY.estimate(rawMb, monthlyMb)} />
    </>
  );
};
