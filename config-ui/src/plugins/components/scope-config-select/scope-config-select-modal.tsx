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

import { getPluginConfig } from '@/plugins/utils';
import { FormModal, MODAL_WIDTH, PluginIcon } from '@/ui';

import { COPY } from './constants';
import { ScopeConfigList } from './scope-config-list';
import type { ScopeConfigSelectModalProps } from './types';

export const ScopeConfigSelectModal = ({
  open,
  plugin,
  connectionId,
  title,
  scopeConfigId,
  onCancel,
  onSubmit,
}: ScopeConfigSelectModalProps) => {
  const [picked, setPicked] = useState<ID>();
  const selectedId = picked ?? scopeConfigId;
  const { icon } = getPluginConfig(plugin);

  return (
    <FormModal
      open={open}
      title={title}
      icon={<PluginIcon icon={icon} size="sm" />}
      width={MODAL_WIDTH.LG}
      submitLabel={COPY.save}
      submitDisabled={!selectedId}
      disabledReason={COPY.disabledReason}
      onSubmit={() => selectedId && onSubmit(selectedId)}
      onCancel={onCancel}
      afterClose={() => setPicked(undefined)}
    >
      <ScopeConfigList
        plugin={plugin}
        connectionId={connectionId}
        scopeConfigId={scopeConfigId}
        selectedId={selectedId}
        onSelect={setPicked}
      />
    </FormModal>
  );
};
