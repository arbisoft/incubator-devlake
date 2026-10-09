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

import { Checkbox } from 'antd';

import { Option, OptionExtra, OptionHint, OptionLabel } from './styled';
import type { SettingOptionProps } from './types';

export const SettingOption = ({ label, description, checked, aside, onChange, children }: SettingOptionProps) => (
  <Option>
    <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)}>
      <OptionLabel>{label}</OptionLabel>
    </Checkbox>
    <OptionHint>
      {description}
      {aside}
    </OptionHint>
    {children && <OptionExtra>{children}</OptionExtra>}
  </Option>
);
