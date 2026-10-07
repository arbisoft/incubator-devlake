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

import { ConnectionModal, DataScopeRemote } from '@/plugins';
import { MODAL_WIDTH } from '@/ui';

import { DETAIL_COPY } from '../constants';
import type { ScopeRow } from '../scope-table';

type AddDataScopeModalProps = {
  open: boolean;
  plugin: string;
  connectionId: ID;
  connectionName: string;
  scopes: ScopeRow[];
  onClose: () => void;
  onAdded: () => void;
};

export const AddDataScopeModal = ({
  open,
  plugin,
  connectionId,
  connectionName,
  scopes,
  onClose,
  onAdded,
}: AddDataScopeModalProps) => (
  <ConnectionModal
    open={open}
    plugin={plugin}
    title={DETAIL_COPY.addScopeTitle(connectionName)}
    width={MODAL_WIDTH.LG}
    onCancel={onClose}
  >
    <DataScopeRemote
      plugin={plugin}
      connectionId={connectionId}
      disabledScope={scopes}
      onCancel={onClose}
      onSubmit={onAdded}
    />
  </ConnectionModal>
);
