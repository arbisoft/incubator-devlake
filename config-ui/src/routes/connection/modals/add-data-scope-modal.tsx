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

import { useRefreshData } from '@/hooks';
import { DataScopeRemoteModal } from '@/plugins';
import { useRefreshVersion } from '@/ui';

import { DETAIL_COPY } from '../constants';

import { loadScopeMembership } from './scope-membership';
import type { AddDataScopeModalProps } from './types';

export const AddDataScopeModal = ({
  open,
  plugin,
  connectionId,
  connectionName,
  onClose,
  onAdded,
}: AddDataScopeModalProps) => {
  const { version, refresh } = useRefreshVersion();
  const { data, ready, error } = useRefreshData(
    (signal) => (open ? loadScopeMembership(plugin, connectionId, signal) : Promise.resolve([])),
    [plugin, connectionId, version, open],
  );

  return (
    <DataScopeRemoteModal
      open={open}
      plugin={plugin}
      connectionId={connectionId}
      title={DETAIL_COPY.addScopeTitle(connectionName)}
      disabledScope={data ?? []}
      loadingScopes={open && !ready && error === undefined}
      scopesLoadFailed={open && error !== undefined}
      onRetryScopes={refresh}
      onCancel={onClose}
      onSubmit={onAdded}
    />
  );
};
