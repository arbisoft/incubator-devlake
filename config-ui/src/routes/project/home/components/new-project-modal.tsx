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

import API from '@/api';
import { FormField, FormModal, useModalForm } from '@/ui';
import { operator } from '@/utils';

import { COPY } from '../constants';
import { buildNewProject } from '../utils';

import type { NewProjectModalProps } from './types';

export const NewProjectModal = ({ open, onClose, onCreated }: NewProjectModalProps) => {
  const { values, setField, reset, setSaving, modalProps } = useModalForm(
    { name: '' },
    { onClose, required: ['name'], disabledReason: COPY.create.disabledReason },
  );
  const { name: field } = COPY.create;

  const submit = async () => {
    const [success] = await operator(async () => API.project.create(buildNewProject(values.name)), {
      setOperating: setSaving,
    });
    if (success) {
      reset();
      onCreated();
    }
  };

  return (
    <FormModal open={open} title={COPY.create.title} submitLabel={COPY.create.submit} onSubmit={submit} {...modalProps}>
      <FormField label={field.label} description={field.description} required>
        {(control) => (
          <Input
            {...control}
            size="large"
            placeholder={field.placeholder}
            value={values.name}
            onChange={(event) => setField('name', event.target.value)}
          />
        )}
      </FormField>
    </FormModal>
  );
};
