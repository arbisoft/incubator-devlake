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

import { DeleteOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PATHS } from '@/config';
import { selectConnection, useHealthChecks } from '@/features/connections';
import { useAppSelector } from '@/hooks';
import { ConnectionStatus, getPluginConfig } from '@/plugins';
import { ConfirmModal, ListPage, ListToolbar, PageHeader, buildListEmpty } from '@/ui';

import { DELETE_KIND, DETAIL_COPY, SCOPE_CONFIG_UNSUPPORTED_PLUGIN } from './constants';
import { AddDataScopeModal, AssociateScopeConfigModal, BulkDeleteModal, ConflictModal } from './modals';
import { ScopeTable, selectedScopes, useScopeSelection } from './scope-table';
import { useAssociateScopeConfig } from './use-associate-scope-config';
import { useBulkDelete } from './use-bulk-delete';
import { useDeleteFlow } from './use-delete-flow';
import { useScopeList } from './use-scope-list';

export const Connection = () => {
  const { plugin, id } = useParams() as { plugin: string; id: string };
  const connectionId = +id;
  const navigate = useNavigate();
  const { check } = useHealthChecks();

  const connection = useAppSelector((state) => selectConnection(state, `${plugin}-${connectionId}`));
  const supportsScopeConfig = useMemo(() => getPluginConfig(plugin).scopeConfig, [plugin]);

  const { list, rows, total, ready, failed, refresh } = useScopeList(plugin, connectionId);
  const { page, setPage } = list;
  const selection = useScopeSelection(rows, ready);
  const { clear: clearSelection } = selection;
  const selected = useMemo(() => selectedScopes(selection.selectedIds, rows), [selection.selectedIds, rows]);

  const [addOpen, setAddOpen] = useState(false);
  const [associateOpen, setAssociateOpen] = useState(false);

  useEffect(() => {
    if (connection) check([connection]);
  }, [check, connection]);

  const handleBulkFinished = useCallback(() => {
    clearSelection();
    setPage(1);
    refresh();
  }, [clearSelection, setPage, refresh]);

  const bulk = useBulkDelete({ plugin, connectionId, onFinished: handleBulkFinished });

  const handleScopeRemoved = useCallback(() => {
    if (rows.length === 1 && page > 1) setPage(page - 1);
    else refresh();
  }, [rows.length, page, setPage, refresh]);

  const flow = useDeleteFlow({
    plugin,
    connectionId,
    onConnectionDeleted: () => navigate(PATHS.CONNECTIONS()),
    onScopeRemoved: handleScopeRemoved,
    onBulkConfirmed: bulk.start,
  });

  const handleAssociate = useAssociateScopeConfig({
    plugin,
    connectionId,
    scopeIds: selection.selectedIds,
    onDone: () => {
      setAssociateOpen(false);
      refresh();
    },
  });

  // The store drops the connection on delete before navigation completes.
  if (!connection) {
    return null;
  }

  const { name, pluginName } = connection;
  const canAssociate = plugin !== SCOPE_CONFIG_UNSUPPORTED_PLUGIN && supportsScopeConfig;
  const noSelection = selected.length === 0;

  const addButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
      {DETAIL_COPY.addScope}
    </Button>
  );

  const empty = buildListEmpty({
    failed,
    onRetry: refresh,
    filtered: list.keyword !== '',
    empty: { ...DETAIL_COPY.empty, action: addButton },
    noResults: DETAIL_COPY.noResults,
  });

  return (
    <ListPage>
      <PageHeader
        title={name}
        description={DETAIL_COPY.description}
        breadcrumbs={[
          { label: DETAIL_COPY.breadcrumbRoot, path: PATHS.CONNECTIONS() },
          { label: pluginName },
          { label: name },
        ]}
        status={<ConnectionStatus connection={connection} />}
        actions={
          <Button danger icon={<DeleteOutlined />} onClick={() => flow.request({ kind: DELETE_KIND.CONNECTION, name })}>
            {DETAIL_COPY.deleteConnection}
          </Button>
        }
      />
      <ListToolbar
        list={list}
        searchPlaceholder={DETAIL_COPY.searchPlaceholder}
        end={
          <>
            {canAssociate && (
              <Button icon={<LinkOutlined />} disabled={noSelection} onClick={() => setAssociateOpen(true)}>
                {DETAIL_COPY.associate}
              </Button>
            )}
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={noSelection}
              onClick={() => flow.request({ kind: DELETE_KIND.SCOPES_BULK, scopes: selected })}
            >
              {DETAIL_COPY.deleteScopes}
            </Button>
            {addButton}
          </>
        }
      />
      <ScopeTable
        plugin={plugin}
        connectionId={connectionId}
        rows={rows}
        total={total}
        loading={!ready && !failed}
        list={list}
        empty={empty}
        selection={selection}
        onScopeConfigChange={refresh}
        onClear={(scope) => flow.request({ kind: DELETE_KIND.SCOPE_CLEAR, scope })}
        onDelete={(scope) => flow.request({ kind: DELETE_KIND.SCOPE_DELETE, scope })}
      />
      <ConfirmModal {...flow.confirmProps} />
      <ConflictModal open={flow.conflictOpen} conflict={flow.conflict} onClose={flow.closeConflict} />
      <BulkDeleteModal state={bulk.state} onClose={bulk.close} afterClose={bulk.reset} />
      <AddDataScopeModal
        open={addOpen}
        plugin={plugin}
        connectionId={connectionId}
        connectionName={name}
        scopes={rows}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          setAddOpen(false);
          refresh();
        }}
      />
      <AssociateScopeConfigModal
        open={associateOpen}
        plugin={plugin}
        connectionId={connectionId}
        onClose={() => setAssociateOpen(false)}
        onSubmit={handleAssociate}
      />
    </ListPage>
  );
};
