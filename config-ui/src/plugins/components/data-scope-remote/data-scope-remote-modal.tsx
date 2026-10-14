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

import API from '@/api';
import { getPluginConfig } from '@/plugins/utils';
import { FormModal, MODAL_WIDTH, PluginIcon, toUserMessage } from '@/ui';
import { operator } from '@/utils';

import { COPY, SAVE_ERROR_MAP } from './constants';
import { DataScopeRemote } from './data-scope-remote';
import type { DataScopeRemoteModalProps, ScopeItem } from './types';

export const DataScopeRemoteModal = ({
  open,
  plugin,
  connectionId,
  title,
  disabledScope,
  onCancel,
  onSubmit,
}: DataScopeRemoteModalProps) => {
  const [selectedScope, setSelectedScope] = useState<ScopeItem[]>([]);
  const [operating, setOperating] = useState(false);
  const { icon } = getPluginConfig(plugin);

  const handleSubmit = async () => {
    const [success] = await operator(
      () => API.scope.batch(plugin, connectionId, { data: selectedScope.map((it) => it.data) }),
      {
        setOperating,
        formatMessage: () => COPY.saved,
        formatReason: (error) => toUserMessage(error, SAVE_ERROR_MAP, COPY.saveFailed),
      },
    );

    if (success) {
      onSubmit();
    }
  };

  return (
    <FormModal
      open={open}
      title={title}
      icon={<PluginIcon icon={icon} size="sm" />}
      width={MODAL_WIDTH.LG}
      submitLabel={COPY.submit}
      loading={operating}
      submitDisabled={!selectedScope.length}
      disabledReason={COPY.disabledReason}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      afterClose={() => setSelectedScope([])}
    >
      <DataScopeRemote
        plugin={plugin}
        connectionId={connectionId}
        disabledScope={disabledScope}
        selectedScope={selectedScope}
        onChangeSelectedScope={setSelectedScope}
      />
    </FormModal>
  );
};
