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

import { FileDoneOutlined } from '@ant-design/icons';
import { Input, Radio } from 'antd';

import API from '@/api';
import { IBPMode } from '@/types';
import { FormField, FormModal, useModalForm } from '@/ui';
import { operator } from '@/utils';

import { DEFAULT_PRESET } from '../../sync-policy';
import { COPY } from '../constants';
import { buildBlueprintCreatePayload } from '../utils';

import type { NewBlueprintModalProps } from './types';

const INITIAL_FORM = { name: '', mode: IBPMode.NORMAL };

export const NewBlueprintModal = ({ open, onClose, onCreated }: NewBlueprintModalProps) => {
  const { values, setField, reset, setSaving, modalProps } = useModalForm(INITIAL_FORM, {
    onClose,
    required: ['name'],
    disabledReason: COPY.create.disabledReason,
  });
  const { name: nameField, mode: modeField } = COPY.create;

  const submit = async () => {
    const payload = buildBlueprintCreatePayload(values.name, values.mode, DEFAULT_PRESET.config);
    const [success] = await operator(() => API.blueprint.create(payload), { setOperating: setSaving });
    if (success) {
      reset();
      onCreated();
    }
  };

  return (
    <FormModal
      open={open}
      icon={<FileDoneOutlined />}
      title={COPY.create.title}
      submitLabel={COPY.create.submit}
      onSubmit={submit}
      {...modalProps}
    >
      <FormField label={nameField.label} description={nameField.description} required>
        {(control) => (
          <Input
            {...control}
            size="large"
            placeholder={nameField.placeholder}
            value={values.name}
            onChange={(event) => setField('name', event.target.value)}
          />
        )}
      </FormField>
      <FormField label={modeField.label} description={modeField.description} required>
        {(control) => (
          <Radio.Group {...control} value={values.mode} onChange={({ target: { value } }) => setField('mode', value)}>
            <Radio value={IBPMode.NORMAL}>{modeField.normal}</Radio>
            <Radio value={IBPMode.ADVANCED}>{modeField.advanced}</Radio>
          </Radio.Group>
        )}
      </FormField>
    </FormModal>
  );
};
