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

import MillerColumnsSelect from 'miller-columns-select';
import { useState } from 'react';

import { Block, Loading } from '@/components';
import { selectWebhooks } from '@/features';
import { useAppSelector } from '@/hooks';
import type { IWebhook } from '@/types';
import { FormModal, MODAL_WIDTH } from '@/ui';

import { COPY, SELECT_COLUMN_HEIGHT } from '../constants';
import { LoadingRow } from '../styled';

import { WebhookIcon } from './webhook-icon';

type SelectorDialogProps = {
  open: boolean;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (items: IWebhook[]) => void;
};

export const SelectorDialog = ({ open, saving, onCancel, onSubmit }: SelectorDialogProps) => {
  const [selectedIds, setSelectedIds] = useState<ID[]>([]);

  const webhooks = useAppSelector(selectWebhooks);

  const handleSubmit = () => onSubmit(webhooks.filter((it) => selectedIds.includes(it.id)));

  return (
    <FormModal
      open={open}
      icon={<WebhookIcon />}
      title={COPY.select.title}
      submitLabel={COPY.select.submit}
      width={MODAL_WIDTH.LG}
      loading={saving}
      submitDisabled={!selectedIds.length}
      onSubmit={handleSubmit}
      onCancel={onCancel}
    >
      <Block title={COPY.select.label} description={COPY.select.description}>
        <MillerColumnsSelect
          columnCount={1}
          columnHeight={SELECT_COLUMN_HEIGHT}
          getHasMore={() => false}
          renderLoading={() => (
            <LoadingRow>
              <Loading size={20} />
            </LoadingRow>
          )}
          items={webhooks.map((it) => ({
            parentId: null,
            id: it.id,
            title: it.name,
            name: it.name,
          }))}
          selectedIds={selectedIds}
          onSelectItemIds={setSelectedIds}
        />
      </Block>
    </FormModal>
  );
};
