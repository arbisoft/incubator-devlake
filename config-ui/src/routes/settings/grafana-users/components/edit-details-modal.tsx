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

import { EditOutlined } from '@ant-design/icons';
import { useState } from 'react';

import API from '@/api';
import { ConfirmModal, FormModal, useModalForm } from '@/ui';
import { operator } from '@/utils';

import { Fields, FormNote, TextField } from '../../components';
import { isValidEmail } from '../../utils';
import { COPY, GRAFANA_FLOW_ERRORS } from '../constants';
import { buildDetailsPatch, getFlowError, getUserDisplayName, hasPatchChanges, normalizeEmail } from '../utils';

import type { UserDialogProps } from './types';

const copy = COPY.details;

export const EditDetailsModal = ({ open, user, onClose, onChanged }: UserDialogProps) => {
  const initial = { name: user?.name ?? '', email: user?.email ?? '' };
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { values, setField, reset, setSaving, modalProps } = useModalForm(initial, {
    onClose,
    required: ['name', 'email'],
    disabledReason: copy.disabledReason,
  });
  const readOnly = user?.sso === true;
  const patch = user ? buildDetailsPatch(user, values) : {};

  const save = async () => {
    if (!user) return;
    const [success] = await operator(() => API.grafanaUsers.updateUser(user.id, patch), {
      setOperating: setSaving,
      formatReason: getFlowError(GRAFANA_FLOW_ERRORS.DETAILS),
    });
    setConfirmOpen(false);
    if (!success) return;
    onChanged();
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (!hasPatchChanges(patch)) return modalProps.onCancel();
    if (patch.email !== undefined) return setConfirmOpen(true);
    return save();
  };

  return (
    <>
      <FormModal
        open={open}
        title={copy.title}
        icon={<EditOutlined aria-hidden />}
        submitLabel={readOnly ? COPY.actions.close : copy.submit}
        showCancel={!readOnly}
        onSubmit={readOnly ? onClose : handleSubmit}
        {...modalProps}
        submitDisabled={!readOnly && (values.name.trim() === '' || !isValidEmail(values.email))}
      >
        <Fields>
          <TextField
            label={COPY.add.name.label}
            value={values.name}
            required
            disabled={readOnly}
            onChange={(value) => setField('name', value)}
          />
          <TextField
            label={COPY.add.email.label}
            value={values.email}
            error={values.email.length > 0 && !isValidEmail(values.email) ? COPY.add.invalidEmail : undefined}
            required
            disabled={readOnly}
            onChange={(value) => setField('email', value)}
          />
          {readOnly && <FormNote>{copy.ssoNote}</FormNote>}
        </Fields>
      </FormModal>
      <ConfirmModal
        open={confirmOpen}
        tone={copy.confirm.tone}
        title={copy.confirm.title()}
        description={copy.confirm.description(user ? getUserDisplayName(user) : '', normalizeEmail(values.email))}
        confirmLabel={copy.confirm.confirm}
        loading={modalProps.loading}
        onConfirm={save}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
};
