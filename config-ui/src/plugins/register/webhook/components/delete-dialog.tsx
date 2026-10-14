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

import { useState } from 'react';

import { removeWebhook } from '@/features';
import { useAppDispatch } from '@/hooks';
import { CONFIRM_TONE, ConfirmModal, toUserMessage } from '@/ui';
import { operator } from '@/utils';

import { COPY, ERROR_MAP, FALLBACK_ERROR } from '../constants';
import type { WebhookDialogProps } from '../types';

type DeleteDialogProps = WebhookDialogProps & {
  onSubmitAfter?: (id: ID) => void;
};

export const DeleteDialog = ({ open, webhook, onCancel, afterClose, onSubmitAfter }: DeleteDialogProps) => {
  const [operating, setOperating] = useState(false);
  const dispatch = useAppDispatch();

  const handleSubmit = async () => {
    const [success] = await operator(() => dispatch(removeWebhook(webhook.id)).unwrap(), {
      setOperating,
      formatMessage: () => COPY.remove.success,
      formatReason: (error) => toUserMessage(error, ERROR_MAP, FALLBACK_ERROR.remove),
    });

    if (success) {
      onSubmitAfter?.(webhook.id);
      onCancel();
    }
  };

  return (
    <ConfirmModal
      open={open}
      tone={CONFIRM_TONE.DANGER}
      title={COPY.remove.title(webhook.name)}
      description={COPY.remove.description}
      confirmLabel={COPY.remove.confirm}
      loading={operating}
      afterClose={afterClose}
      onConfirm={handleSubmit}
      onCancel={onCancel}
    />
  );
};
