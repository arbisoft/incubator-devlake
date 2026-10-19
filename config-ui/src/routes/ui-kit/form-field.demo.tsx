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

import { Input } from 'antd';

import { FormField } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';
import { Narrow } from './styled';

const { formField: text } = COPY;

export const FormFieldDemo = () => (
  <DemoSection id={SECTION.FORM_FIELD} title={COPY.sections.formField}>
    <DemoCase label={COPY.cases.default}>
      <FormField label={text.label} description={text.hint} required>
        {(control) => <Input {...control} placeholder={text.placeholder} />}
      </FormField>
    </DemoCase>
    <DemoCase label={COPY.cases.longText}>
      <Narrow>
        <FormField label={text.longLabel} description={text.longHint}>
          {(control) => <Input {...control} placeholder={text.placeholder} />}
        </FormField>
      </Narrow>
    </DemoCase>
  </DemoSection>
);
