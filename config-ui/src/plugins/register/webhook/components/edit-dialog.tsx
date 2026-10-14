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

import { updateWebhook } from '@/features';
import { useAppDispatch } from '@/hooks';
import { FormField, FormModal, MODAL_WIDTH, toUserMessage, useModalForm } from '@/ui';
import { operator } from '@/utils';

import { COPY, ERROR_MAP, FALLBACK_ERROR } from '../constants';
import type { WebhookDialogProps } from '../types';

import { WebhookIcon } from './webhook-icon';

export const EditDialog = ({ open, webhook, onCancel, afterClose }: WebhookDialogProps) => {
  const dispatch = useAppDispatch();
  const { values, setField, setSaving, modalProps } = useModalForm(
    { name: webhook.name },
    { onClose: onCancel, required: ['name'], disabledReason: COPY.create.disabledReason },
  );

  const handleSubmit = async () => {
    const [success] = await operator(() => dispatch(updateWebhook({ id: webhook.id, name: values.name })).unwrap(), {
      setOperating: setSaving,
      formatMessage: () => COPY.edit.success,
      formatReason: (error) => toUserMessage(error, ERROR_MAP, FALLBACK_ERROR.edit),
    });

    if (success) onCancel();
  };

  return (
    <FormModal
      open={open}
      icon={<WebhookIcon />}
      title={COPY.edit.title}
      submitLabel={COPY.edit.submit}
      width={MODAL_WIDTH.SM}
      afterClose={afterClose}
      onSubmit={handleSubmit}
      {...modalProps}
    >
      <FormField label={COPY.create.nameLabel} required>
        {(control) => (
          <Input {...control} value={values.name} onChange={(event) => setField('name', event.target.value)} />
        )}
      </FormField>
    </FormModal>
  );
};
