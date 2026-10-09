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

import { Button, Input } from 'antd';

import { useModalForm } from '@/ui';

import { COPY, SECTION } from './constants';
import { DemoCase, DemoSection } from './demo-section';

export const UseModalFormDemo = () => {
  const { values, setField, reset, setSaving, modalProps } = useModalForm(
    { name: '' },
    { onClose: () => undefined, required: [], disabledReason: COPY.useModalForm.field },
  );
  const { loading: saving } = modalProps;
  return (
    <DemoSection id={SECTION.USE_MODAL_FORM} title={COPY.sections.useModalForm}>
      <DemoCase label={COPY.cases.interactive}>
        <Input
          aria-label={COPY.useModalForm.field}
          value={values.name}
          onChange={(event) => setField('name', event.target.value)}
        />
        <Button onClick={reset}>{COPY.useModalForm.reset}</Button>
        <Button onClick={() => setSaving(!saving)}>{COPY.useModalForm.toggleSaving}</Button>
        <span role="status">{COPY.useModalForm.state(values.name, saving)}</span>
      </DemoCase>
    </DemoSection>
  );
};
