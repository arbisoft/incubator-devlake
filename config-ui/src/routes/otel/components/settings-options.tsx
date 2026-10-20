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

import { childrenOf, estimateStorage, hasSingleSignal, isLastSignal, TOP_LEVEL_OPTIONS } from '../managed-settings';
import { Hint } from '../styled';
import type { SettingsOption, SettingsOptionsProps } from '../types';

import { COPY } from './constants';
import { OPTION_COPY } from './option-copy';
import { OptionHelp } from './option-help';

const OPTIONS_COPY = COPY.snippet.options;

export const SettingsOptions = ({ value, onChange }: SettingsOptionsProps) => {
  const renderOption = (option: SettingsOption) => (
    <SettingOption
      key={option}
      label={OPTION_COPY[option].label}
      description={OPTION_COPY[option].description}
      aside={
        <HelpPopover label={OPTIONS_COPY.help(OPTION_COPY[option].label)} content={<OptionHelp option={option} />} />
      }
      checked={value[option]}
      disabled={isLastSignal(value, option)}
      onChange={(checked) => onChange({ ...value, [option]: checked })}
    >
      {value[option] && childrenOf(option).map((child) => renderOption(child))}
    </SettingOption>
  );

  const { rawMb, monthlyMb } = estimateStorage(value);

  return (
    <>
      <div role="group" aria-label={OPTIONS_COPY.title}>
        {TOP_LEVEL_OPTIONS.map((option) => renderOption(option))}
      </div>
      {hasSingleSignal(value) && <Hint>{OPTIONS_COPY.lastSignal}</Hint>}
      <Alert type="info" role="status" showIcon title={OPTIONS_COPY.estimate(rawMb, monthlyMb)} />
    </>
  );
};
