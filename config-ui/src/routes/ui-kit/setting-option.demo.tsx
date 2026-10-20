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

import { useState } from 'react';

import { SettingOption } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';

export const SettingOptionDemo = () => {
  const [plain, setPlain] = useState(true);
  const [parent, setParent] = useState(true);
  const [child, setChild] = useState(false);

  return (
    <DemoSection id={SECTION.SETTING_OPTION} title={COPY.sections.settingOption}>
      <DemoCase label={COPY.cases.default}>
        <SettingOption
          label={COPY.settingOption.label}
          description={COPY.settingOption.description}
          checked={plain}
          onChange={setPlain}
        />
      </DemoCase>
      <DemoCase label={COPY.settingOption.nested}>
        <SettingOption
          label={COPY.settingOption.label}
          description={COPY.settingOption.description}
          checked={parent}
          onChange={setParent}
        >
          {parent && (
            <SettingOption
              label={COPY.settingOption.nested}
              description={COPY.settingOption.description}
              checked={child}
              onChange={setChild}
            />
          )}
        </SettingOption>
      </DemoCase>
      <DemoCase label={COPY.cases.disabled}>
        <SettingOption
          label={COPY.settingOption.label}
          description={COPY.settingOption.description}
          checked
          disabled
          onChange={setPlain}
        />
      </DemoCase>
    </DemoSection>
  );
};
