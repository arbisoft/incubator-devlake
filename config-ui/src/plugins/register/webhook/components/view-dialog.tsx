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

import { useMemo, useState } from 'react';

import { renewWebhookApiKey } from '@/features';
import { useAppDispatch } from '@/hooks';
import { CODE_LANGUAGE, CodeBlock, CONFIRM_TONE, ConfirmModal, FormModal, MODAL_WIDTH, toUserMessage } from '@/ui';
import { operator } from '@/utils';

import { COPY, ERROR_MAP, FALLBACK_ERROR } from '../constants';
import { Group, GroupTitle, Hint, Intro, KeyRow, Notice, Stack } from '../styled';
import type { WebhookDialogProps } from '../types';
import { buildCommands, getApiPrefix } from '../utils';

import { WebhookCommands } from './webhook-commands';
import { WebhookIcon } from './webhook-icon';

export const ViewDialog = ({ open, webhook, onCancel, afterClose }: WebhookDialogProps) => {
  const [confirming, setConfirming] = useState(false);
  const [operating, setOperating] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const dispatch = useAppDispatch();
  const commands = useMemo(
    () => buildCommands(getApiPrefix(window.location.origin), webhook, apiKey),
    [webhook, apiKey],
  );

  const handleRenew = async () => {
    const [success, res] = await operator(() => dispatch(renewWebhookApiKey(webhook.id)).unwrap(), {
      setOperating,
      formatMessage: () => COPY.view.renewSuccess,
      formatReason: (error) => toUserMessage(error, ERROR_MAP, FALLBACK_ERROR.renew),
    });

    if (success) {
      setApiKey(res.apiKey);
      setConfirming(false);
    }
  };

  return (
    <>
      <FormModal
        open={open}
        icon={<WebhookIcon />}
        title={COPY.view.title}
        submitLabel={COPY.view.renew}
        showCancel={false}
        width={MODAL_WIDTH.LG}
        afterClose={afterClose}
        onSubmit={() => setConfirming(true)}
        onCancel={onCancel}
      >
        <Stack>
          <Intro>{COPY.view.intro}</Intro>
          <WebhookCommands commands={commands} />
          <Group>
            <GroupTitle>{COPY.view.keyTitle}</GroupTitle>
            <Hint>{COPY.view.keyDescription}</Hint>
            {apiKey && (
              <>
                <KeyRow>
                  <CodeBlock value={apiKey} language={CODE_LANGUAGE.SHELL} copyLabel={COPY.view.copyKey} />
                  <span>{COPY.view.noExpiration}</span>
                </KeyRow>
                <Notice>{COPY.view.keyNotice}</Notice>
              </>
            )}
          </Group>
        </Stack>
      </FormModal>
      <ConfirmModal
        open={confirming}
        tone={CONFIRM_TONE.DANGER}
        title={COPY.view.renewTitle(webhook.name)}
        description={COPY.view.renewDescription}
        confirmLabel={COPY.view.renewConfirm}
        loading={operating}
        onConfirm={handleRenew}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
};
