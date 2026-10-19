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

import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useMemo, useRef } from 'react';

import { PageLoading } from '@/components';
import { ConnectionModal, DataScopeSelect } from '@/plugins';
import { ScopeTable } from '@/routes/connection/scope-table';
import {
  COMMON_COPY,
  ConfirmModal,
  CONFIRM_TONE,
  EMPTY_ILLUSTRATION,
  EMPTY_STATE_SIZE,
  EmptyState,
  ExternalLink,
  ListPage,
  MODAL_WIDTH,
  PageHeader,
  buildListEmpty,
} from '@/ui';

import { COPY } from './constants';
import { useConnectionActions, useConnectionDetail, useScopeRows } from './hooks';
import type { ConnectionDetailViewProps } from './types';
import { getBreadcrumbs, getDetailRoutes, getScopeIds } from './utils';

const ConnectionDetailView = ({
  blueprint,
  connectionName,
  plugin,
  connectionId,
  pname,
  onChanged,
}: ConnectionDetailViewProps) => {
  const manageButton = useRef<HTMLButtonElement>(null);
  const ref = useMemo(() => ({ plugin, connectionId }), [plugin, connectionId]);
  const scope = { pname, blueprintId: blueprint.id };
  const routes = getDetailRoutes(scope, ref);
  const scopeIds = useMemo(() => getScopeIds(blueprint.connections, ref), [blueprint.connections, ref]);
  const scopes = useScopeRows(ref, scopeIds);
  const actions = useConnectionActions({ blueprint, pname, ref, connectionName, routes, onChanged });
  const empty = buildListEmpty({
    failed: scopes.failed,
    onRetry: scopes.refresh,
    filtered: false,
    empty: COPY.scopes.empty,
    noResults: COPY.scopes.empty,
  });

  return (
    <ListPage>
      <PageHeader
        title={COPY.title(connectionName)}
        breadcrumbs={getBreadcrumbs(scope, routes)}
        description={
          <>
            {COPY.description.prefix} <ExternalLink href={routes.connection}>{COPY.description.link}</ExternalLink>.
          </>
        }
        actions={
          <>
            <Button ref={manageButton} type="primary" icon={<EditOutlined />} onClick={actions.openManage}>
              {COPY.manage.action}
            </Button>
            <Button danger icon={<DeleteOutlined />} onClick={actions.requestRemove}>
              {COPY.remove.action}
            </Button>
          </>
        }
      />
      <ScopeTable
        plugin={plugin}
        connectionId={connectionId}
        rows={scopes.rows}
        total={scopes.total}
        loading={!scopes.ready && !scopes.failed}
        list={scopes.list}
        empty={empty}
        showProjects={false}
        onScopeConfigChange={scopes.refresh}
      />
      <ConnectionModal
        open={actions.manageOpen}
        plugin={plugin}
        title={COPY.manage.title}
        width={MODAL_WIDTH.LG}
        onCancel={actions.closeManage}
      >
        <DataScopeSelect
          plugin={plugin}
          connectionId={connectionId}
          showWarning
          initialScope={scopeIds.map((id) => ({ id }))}
          onCancel={actions.closeManage}
          onSubmit={actions.changeScopes}
        />
      </ConnectionModal>
      <ConfirmModal {...actions.removeProps} />
      <ConfirmModal
        open={actions.followUp.open}
        tone={CONFIRM_TONE.DEFAULT}
        title={COPY.followUp.title}
        description={COPY.followUp.description}
        confirmLabel={COPY.followUp.confirm}
        cancelLabel={COPY.followUp.cancel}
        loading={actions.running}
        onConfirm={actions.recollect}
        onCancel={actions.postpone}
        afterClose={() => manageButton.current?.focus()}
      />
    </ListPage>
  );
};

export const BlueprintConnectionDetailPage = () => {
  const { pname, ref, data, failed, ready, refresh } = useConnectionDetail();

  if (!data) {
    if (failed) {
      return (
        <EmptyState
          size={EMPTY_STATE_SIZE.PAGE}
          illustration={EMPTY_ILLUSTRATION.ERROR}
          title={COPY.errors.load}
          action={<Button onClick={refresh}>{COMMON_COPY.retry}</Button>}
        />
      );
    }
    return ready ? (
      <EmptyState
        size={EMPTY_STATE_SIZE.PAGE}
        title={COPY.noBlueprint.title}
        description={COPY.noBlueprint.description}
      />
    ) : (
      <PageLoading />
    );
  }

  return <ConnectionDetailView {...data} {...ref} pname={pname} onChanged={refresh} />;
};
