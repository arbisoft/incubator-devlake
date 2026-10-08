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

import { Button, Tooltip } from 'antd';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import API from '@/api';
import { PATHS, PROJECT_TAB } from '@/config';
import { WebhookSelectorDialog, WebHookConnection, type WebhookItemType } from '@/plugins/register/webhook';
import type { IBlueprint } from '@/types';
import { SectionCard } from '@/ui';
import { operator } from '@/utils';

import { COPY } from './constants';
import { NoticeBody, NoticeText, Stack } from './styled';
import type { ProjectPanelProps } from './types';
import { attachWebhooks, detachWebhook, getWebhookIds } from './utils';

export const WebhooksPanel = ({ project, onRefresh }: ProjectPanelProps) => {
  const [selecting, setSelecting] = useState(false);
  const [operating, setOperating] = useState(false);

  const { blueprint } = project;
  const webhookIds = useMemo(() => getWebhookIds(blueprint), [blueprint]);

  const update = async (next: (current: IBlueprint) => IBlueprint, done: string) => {
    if (!blueprint) return false;
    const [success] = await operator(() => API.blueprint.update(blueprint.id, next(blueprint)), {
      setOperating,
      formatMessage: () => done,
      formatReason: () => COPY.webhooks.updateFailed,
    });
    if (success) onRefresh();
    return success;
  };

  const handleCreate = (id: ID) => update((current) => attachWebhooks(current, [id]), COPY.webhooks.attached);

  const handleDelete = (id: ID) => update((current) => detachWebhook(current, id), COPY.webhooks.detached);

  const handleSelect = async (items: WebhookItemType[]) => {
    const ids = items.map((item) => item.id);
    if (await update((current) => attachWebhooks(current, ids), COPY.webhooks.attached)) {
      setSelecting(false);
    }
  };

  const disabledReason = blueprint ? undefined : COPY.webhooks.noBlueprint;

  return (
    <Stack>
      <NoticeBody role="note">
        <NoticeText>{COPY.webhooks.notice.dora}</NoticeText>
        <NoticeText>
          {COPY.webhooks.notice.beforeLink}{' '}
          <Link to={PATHS.PROJECT_TAB(project.name, PROJECT_TAB.BLUEPRINT)}>{COPY.webhooks.notice.link}</Link>{' '}
          {COPY.webhooks.notice.afterLink}
        </NoticeText>
      </NoticeBody>
      <SectionCard title={COPY.webhooks.title} count={webhookIds.length}>
        <WebHookConnection
          filterIds={webhookIds}
          addDisabledReason={disabledReason}
          extraActions={
            <Tooltip title={disabledReason}>
              <Button disabled={!blueprint} onClick={() => setSelecting(true)}>
                {COPY.webhooks.selectExisting}
              </Button>
            </Tooltip>
          }
          onCreateAfter={handleCreate}
          onDeleteAfter={handleDelete}
        />
      </SectionCard>
      <WebhookSelectorDialog
        open={selecting}
        saving={operating}
        onCancel={() => setSelecting(false)}
        onSubmit={handleSelect}
      />
    </Stack>
  );
};
