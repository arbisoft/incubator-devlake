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

import { PlusOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useMemo, useState } from 'react';

import { selectWebhooks } from '@/features/connections';
import { useAppSelector } from '@/hooks';
import type { IWebhook } from '@/types';
import { DataTable, EMPTY_STATE_SIZE } from '@/ui';

import { getColumns } from './columns';
import { CreateDialog, DeleteDialog, EditDialog, ViewDialog } from './components';
import { COPY, WEBHOOK_DIALOG } from './constants';
import { Actions, Stack } from './styled';
import type { WebHookConnectionProps, WebhookDialogKind } from './types';

export const WebHookConnection = ({
  filterIds,
  extraActions,
  addDisabledReason,
  onCreateAfter,
  onDeleteAfter,
}: WebHookConnectionProps) => {
  const [kind, setKind] = useState<WebhookDialogKind>();
  const [target, setTarget] = useState<IWebhook>();

  const webhooks = useAppSelector(selectWebhooks);
  const rows = useMemo(
    () => webhooks.filter((webhook) => (filterIds ? filterIds.includes(webhook.id) : true)),
    [webhooks, filterIds],
  );
  const columns = useMemo(
    () =>
      getColumns({
        onOpen: (next, webhook) => {
          setTarget(webhook);
          setKind(next);
        },
      }),
    [],
  );

  const hide = () => setKind(undefined);
  const forget = () => setTarget(undefined);

  return (
    <Stack>
      <DataTable<IWebhook>
        rowKey="id"
        ariaLabel={COPY.tableLabel}
        loading={false}
        columns={columns}
        dataSource={rows}
        pagination={false}
        empty={{ ...COPY.empty, size: EMPTY_STATE_SIZE.SECTION }}
      />
      <Actions>
        <Tooltip title={addDisabledReason}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={addDisabledReason !== undefined}
            onClick={() => setKind(WEBHOOK_DIALOG.ADD)}
          >
            {COPY.add}
          </Button>
        </Tooltip>
        {extraActions}
      </Actions>
      <CreateDialog open={kind === WEBHOOK_DIALOG.ADD} onCancel={hide} onSubmitAfter={onCreateAfter} />
      {target && (
        <>
          <ViewDialog
            key={`view-${target.id}`}
            open={kind === WEBHOOK_DIALOG.VIEW}
            webhook={target}
            onCancel={hide}
            afterClose={forget}
          />
          <EditDialog
            key={`edit-${target.id}`}
            open={kind === WEBHOOK_DIALOG.EDIT}
            webhook={target}
            onCancel={hide}
            afterClose={forget}
          />
          <DeleteDialog
            key={`delete-${target.id}`}
            open={kind === WEBHOOK_DIALOG.DELETE}
            webhook={target}
            onCancel={hide}
            afterClose={forget}
            onSubmitAfter={onDeleteAfter}
          />
        </>
      )}
    </Stack>
  );
};
