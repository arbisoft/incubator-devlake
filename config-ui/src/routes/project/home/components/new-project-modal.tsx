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
import { useState } from 'react';

import API from '@/api';
import { FormField, FormModal, MODAL_WIDTH } from '@/ui';
import { operator } from '@/utils';

import { COPY } from '../constants';
import { buildNewProject } from '../utils';

import type { NewProjectModalProps } from './types';

export const NewProjectModal = ({ onClose, onCreated }: NewProjectModalProps) => {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const { name: field } = COPY.create;

  const submit = async () => {
    const [success] = await operator(async () => API.project.create(buildNewProject(name)), {
      setOperating: setSaving,
    });
    if (success) onCreated();
  };

  return (
    <FormModal
      open
      title={COPY.create.title}
      submitLabel={COPY.create.submit}
      width={MODAL_WIDTH.MD}
      loading={saving}
      submitDisabled={!name}
      disabledReason={COPY.create.disabledReason}
      onSubmit={submit}
      onCancel={onClose}
    >
      <FormField label={field.label} description={field.description} required>
        {(control) => (
          <Input
            {...control}
            size="large"
            placeholder={field.placeholder}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </FormField>
    </FormModal>
  );
};
