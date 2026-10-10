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

import type { AccessRole } from '@/api/access';
import { FormModal, useModalForm } from '@/ui';

import { FormNote } from './form-note';
import { RoleField } from './role-field';
import { Fields } from './styled';
import type { AccessFormModalProps } from './types';

export const AccessFormModal = <T extends object>({
  open,
  onClose,
  copy,
  icon,
  initial,
  required,
  isValid,
  submit,
  children,
}: AccessFormModalProps<T>) => {
  const { values, setField, reset, setSaving, modalProps } = useModalForm(initial, {
    onClose,
    required,
    disabledReason: copy.disabledReason,
  });

  const handleSubmit = async () => {
    if (await submit(values, setSaving)) reset();
  };

  return (
    <FormModal
      open={open}
      title={copy.title}
      icon={icon}
      submitLabel={copy.submit}
      onSubmit={handleSubmit}
      {...modalProps}
      submitDisabled={!isValid(values)}
    >
      <Fields>
        {children(values, setField)}
        {copy.role && 'role' in values && (
          <RoleField
            label={copy.role.label}
            value={values.role as AccessRole}
            onChange={(role) => setField('role' as keyof T, role as T[keyof T])}
          />
        )}
        <FormNote>{copy.note}</FormNote>
      </Fields>
    </FormModal>
  );
};
