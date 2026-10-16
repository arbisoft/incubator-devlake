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

import { CheckCircleOutlined } from '@ant-design/icons';
import { Input } from 'antd';
import { useMemo, useState } from 'react';

import { addWebhook } from '@/features';
import { useAppDispatch } from '@/hooks';
import { FormField, FormModal, MODAL_WIDTH, toUserMessage, useModalForm } from '@/ui';
import { operator } from '@/utils';

import { COPY, ERROR_MAP, FALLBACK_ERROR } from '../constants';
import { Intro, Stack, Success } from '../styled';
import type { CreateDialogProps, WebhookCommands as Commands } from '../types';
import { buildCommands, getApiPrefix } from '../utils';

import { WebhookCommands } from './webhook-commands';
import { WebhookIcon } from './webhook-icon';

const INITIAL_FORM = { name: '' };

export const CreateDialog = ({ open, onCancel, onSubmitAfter }: CreateDialogProps) => {
  const [commands, setCommands] = useState<Commands>();
  const dispatch = useAppDispatch();
  const prefix = useMemo(() => getApiPrefix(window.location.origin), []);
  const { values, setField, reset, setSaving, modalProps } = useModalForm(INITIAL_FORM, {
    onClose: onCancel,
    required: ['name'],
    disabledReason: COPY.create.disabledReason,
  });

  const handleSubmit = async () => {
    const [success, res] = await operator(
      async () => {
        const { webhook, apiKey } = await dispatch(addWebhook({ name: values.name })).unwrap();
        return { id: webhook.id, commands: buildCommands(prefix, webhook, apiKey) };
      },
      {
        setOperating: setSaving,
        formatMessage: () => COPY.create.success,
        formatReason: (error) => toUserMessage(error, ERROR_MAP, FALLBACK_ERROR.create),
      },
    );

    if (success) {
      setCommands(res.commands);
      onSubmitAfter?.(res.id);
    }
  };

  const handleClosed = () => {
    setCommands(undefined);
    reset();
  };

  return (
    <FormModal
      open={open}
      icon={<WebhookIcon />}
      title={COPY.create.title}
      submitLabel={commands ? COPY.create.done : COPY.create.submit}
      showCancel={!commands}
      width={commands ? MODAL_WIDTH.LG : MODAL_WIDTH.SM}
      afterClose={handleClosed}
      onSubmit={commands ? onCancel : handleSubmit}
      {...modalProps}
      submitDisabled={!commands && modalProps.submitDisabled}
    >
      {commands ? (
        <Stack>
          <Success>
            <CheckCircleOutlined aria-hidden />
            {COPY.create.generated}
          </Success>
          <Intro>{COPY.create.keyNotice}</Intro>
          <WebhookCommands commands={commands} />
        </Stack>
      ) : (
        <FormField label={COPY.create.nameLabel} description={COPY.create.nameDescription} required>
          {(control) => (
            <Input
              {...control}
              placeholder={COPY.create.namePlaceholder}
              value={values.name}
              onChange={(event) => setField('name', event.target.value)}
            />
          )}
        </FormField>
      )}
    </FormModal>
  );
};
