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

import { KeyValueList } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { KEY_VALUE_ITEMS, KEY_VALUE_LONG_ITEMS } from './fixtures';
import { Narrow } from './styled';

export const KeyValueListDemo = () => (
  <DemoSection id={SECTION.KEY_VALUE_LIST} title={COPY.sections.keyValueList}>
    <DemoCase label={COPY.cases.default}>
      <KeyValueList items={KEY_VALUE_ITEMS} />
    </DemoCase>
    <DemoCase label={COPY.cases.empty}>
      <KeyValueList items={[]} />
    </DemoCase>
    <DemoCase label={COPY.cases.overflow}>
      <Narrow>
        <KeyValueList items={KEY_VALUE_LONG_ITEMS} />
      </Narrow>
    </DemoCase>
  </DemoSection>
);
