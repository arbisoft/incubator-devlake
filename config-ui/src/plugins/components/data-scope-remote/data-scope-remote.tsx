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

import { useMemo } from 'react';

import { getPluginConfig } from '@/plugins/utils';

import { SCOPE_MODE } from './constants';
import { SearchLocal } from './search-local';
import { SearchRemote } from './search-remote';
import { Body, DuplicateAlert } from './styled';
import type { DataScopeRemoteProps } from './types';
import { useScopeDuplicates } from './use-scope-duplicates';

export const DataScopeRemote = ({
  mode = SCOPE_MODE.MULTIPLE,
  plugin,
  connectionId,
  selectedScope,
  disabledScope,
  onChangeSelectedScope,
}: DataScopeRemoteProps) => {
  const config = useMemo(() => getPluginConfig(plugin).dataScope, [plugin]);
  const { warning, dismiss } = useScopeDuplicates(plugin, connectionId, selectedScope);

  const searchProps = {
    mode,
    plugin,
    connectionId,
    config,
    disabledScope: disabledScope ?? [],
    selectedScope,
    onChange: onChangeSelectedScope,
  };

  const renderPicker = () => {
    if (config.render) {
      return config.render({
        connectionId,
        disabledItems: disabledScope?.map((it) => ({ id: it.id })),
        selectedItems: selectedScope,
        onChangeSelectedItems: onChangeSelectedScope,
      });
    }
    return config.localSearch ? <SearchLocal {...searchProps} /> : <SearchRemote {...searchProps} />;
  };

  return (
    <Body>
      {warning && <DuplicateAlert type="warning" showIcon closable onClose={dismiss} title={warning} />}
      {renderPicker()}
    </Body>
  );
};
