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

import { FormField } from '@/ui/form-field';
import { FormModal } from '@/ui/form-modal';

import { COPY } from './constants';
import type { NameModalProps } from './types';

export const NameModal = ({ open, name, loading, onSubmit, onCancel }: NameModalProps) => {
  const [draft, setDraft] = useState<string>();
  const value = draft ?? name;

  return (
    <FormModal
      open={open}
      title={COPY.name.modalTitle}
      submitLabel={COPY.name.submit}
      loading={loading}
      submitDisabled={!value || value === name}
      disabledReason={COPY.name.disabledReason}
      onSubmit={() => onSubmit(value)}
      onCancel={onCancel}
      afterClose={() => setDraft(undefined)}
    >
      <FormField label={COPY.name.label} description={COPY.name.description} required>
        {(control) => (
          <Input {...control} size="large" value={value} onChange={({ target }) => setDraft(target.value)} />
        )}
      </FormField>
    </FormModal>
  );
};
