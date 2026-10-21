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
import { Alert, Button } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import API from '@/api';
import type { OtelConnectionResponse } from '@/api/otel';
import { PATHS } from '@/config';
import { useAutoRefresh, useRefreshData } from '@/hooks';
import {
  ConfirmModal,
  DataTable,
  ListPage,
  PageHeader,
  SectionCard,
  Toolbar,
  buildListEmpty,
  useRefreshVersion,
} from '@/ui';
import { EMPTY_ILLUSTRATION } from '@/ui/empty-state';

import { getConnectionColumns } from './columns';
import { CreateModal, ProjectsModal, RebindModal, SnippetModal } from './components';
import { COPY, LIFECYCLE_ACTION, OTEL_MODAL, OTEL_POLL } from './constants';
import { OtelIngestionHealth } from './ingestion-health';
import { OtelReplays } from './replays';
import { OtelSourcePolicy } from './source-policy';
import { Hint } from './styled';
import type { LifecycleAction, OtelModal, PendingCredentialFocus } from './types';
import { useClientPagination } from './use-client-pagination';
import { useOtelAction } from './use-otel-action';
import {
  getCreateIntent,
  hasRecoveryRequired,
  hasStorageNeedsApplying,
  isRotation,
  notifyOtelAttentionChanged,
} from './utils';

const BREADCRUMBS = [{ label: COPY.breadcrumbConnections, path: PATHS.CONNECTIONS() }, { label: COPY.title }];

export const Otel = () => {
  const { version, refresh } = useRefreshVersion();
  const [searchParams, setSearchParams] = useSearchParams();
  const [intent] = useState(() => getCreateIntent(searchParams));
  const [modal, setModal] = useState<OtelModal | undefined>(intent ? OTEL_MODAL.CREATE : undefined);
  const [presetProject, setPresetProject] = useState(intent);
  const [target, setTarget] = useState<OtelConnectionResponse>();
  const [credential, setCredential] = useState<OtelConnectionResponse>();
  const [credentialOpen, setCredentialOpen] = useState(false);
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const actionButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingCredentialFocus = useRef<PendingCredentialFocus | undefined>(undefined);

  const connections = useAutoRefresh((signal) => API.otel.list(signal), [version], OTEL_POLL);
  const ingestion = useAutoRefresh((signal) => API.otel.ingestionStatus(signal), [version], OTEL_POLL);
  const preferences = useAutoRefresh((signal) => API.otel.listSourcePreferences(signal), [version], OTEL_POLL);
  const projectOptionsQuery = useRefreshData((signal) => API.otel.listProjects(signal), [version]);
  const projectOptions = projectOptionsQuery.data;

  const rows = useMemo(() => connections.data ?? [], [connections.data]);
  const rebindTarget = rows.find((row) => row.connection.id === target?.connection.id) ?? target;
  const { rows: pageRows, pagination } = useClientPagination(rows);
  const failed = connections.data === undefined && connections.error !== undefined;

  const showCredential = useCallback((response: OtelConnectionResponse) => {
    const rotated = isRotation(response);
    pendingCredentialFocus.current = rotated
      ? { connectionId: response.connection.id, action: LIFECYCLE_ACTION.FINALIZE }
      : {};
    setCredential(response);
    setCredentialOpen(true);
  }, []);
  const { start, confirmProps } = useOtelAction({ onDone: refresh, onCredential: showCredential });

  useEffect(() => {
    if (intent) setSearchParams({}, { replace: true });
  }, [intent, setSearchParams]);

  const closeModal = useCallback(() => {
    setModal(undefined);
    setPresetProject(undefined);
  }, []);

  const closeCredential = useCallback(() => {
    setCredential(undefined);
  }, []);

  const registerActionButton = useCallback(
    (connectionId: string | number, action: LifecycleAction, button: HTMLButtonElement | null) => {
      const key = `${connectionId}:${action}`;
      if (button) actionButtonRefs.current.set(key, button);
      else actionButtonRefs.current.delete(key);
    },
    [],
  );

  useEffect(() => {
    const pending = pendingCredentialFocus.current;
    if (credentialOpen || credential || !pending) return;

    const button =
      pending.action && pending.connectionId !== undefined
        ? actionButtonRefs.current.get(`${pending.connectionId}:${pending.action}`)
        : generateButtonRef.current;
    if (!button || button.disabled) return;

    button.focus();
    pendingCredentialFocus.current = undefined;
  }, [credential, credentialOpen, rows]);

  const columns = useMemo(
    () =>
      getConnectionColumns({
        onManageProjects: (connection) => {
          setTarget(connection);
          setModal(OTEL_MODAL.PROJECTS);
        },
        onRebind: (connection) => {
          setTarget(connection);
          setModal(OTEL_MODAL.REBIND);
        },
        onAction: start,
        onActionButtonRef: registerActionButton,
      }),
    [registerActionButton, start],
  );

  const empty = buildListEmpty({
    failed,
    onRetry: refresh,
    filtered: false,
    empty: { ...COPY.connections.empty, illustration: EMPTY_ILLUSTRATION.NO_CONNECTION },
    noResults: COPY.connections.empty,
  });

  return (
    <ListPage>
      <PageHeader title={COPY.title} description={COPY.description} breadcrumbs={BREADCRUMBS} />
      <Toolbar
        end={
          <Button
            ref={generateButtonRef}
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            onClick={() => setModal(OTEL_MODAL.CREATE)}
          >
            {COPY.generate}
          </Button>
        }
      />
      {hasRecoveryRequired(rows) && <Alert type="error" showIcon title={COPY.notices.recovery} />}
      {hasStorageNeedsApplying(rows) && <Alert type="warning" showIcon title={COPY.notices.storage} />}
      <SectionCard title={COPY.connections.title} count={connections.data && rows.length}>
        {rows.length > 0 && <Hint>{COPY.connections.scrollHint}</Hint>}
        <DataTable
          rowKey={({ connection }) => connection.id}
          ariaLabel={COPY.connections.tableLabel}
          loading={connections.data === undefined && !failed}
          columns={columns}
          dataSource={pageRows}
          pagination={pagination}
          empty={empty}
        />
      </SectionCard>
      <OtelIngestionHealth
        loading={ingestion.data === undefined && ingestion.error === undefined}
        failed={ingestion.data === undefined && ingestion.error !== undefined}
        status={ingestion.data}
        onRetry={refresh}
      />
      <OtelReplays version={version} />
      <OtelSourcePolicy
        loading={preferences.data === undefined && preferences.error === undefined}
        failed={preferences.data === undefined && preferences.error !== undefined}
        preferences={preferences.data}
        onRetry={refresh}
      />
      {projectOptionsQuery.error !== undefined && (
        <Alert
          type="error"
          showIcon
          title={COPY.projectOptionsUnavailable}
          action={<Button onClick={refresh}>{COPY.health.retry}</Button>}
        />
      )}
      <CreateModal
        open={modal === OTEL_MODAL.CREATE}
        presetProject={presetProject}
        projectOptions={projectOptions ?? []}
        onClose={closeModal}
        onCreated={(response) => {
          closeModal();
          showCredential(response);
          refresh();
          notifyOtelAttentionChanged();
        }}
      />
      <ProjectsModal
        open={modal === OTEL_MODAL.PROJECTS}
        connection={target}
        projectOptions={projectOptions ?? []}
        onClose={closeModal}
        onSaved={() => {
          closeModal();
          refresh();
        }}
      />
      <RebindModal
        open={modal === OTEL_MODAL.REBIND}
        connection={rebindTarget}
        onClose={closeModal}
        onRebound={() => {
          closeModal();
          refresh();
          notifyOtelAttentionChanged();
        }}
      />
      <SnippetModal
        open={credentialOpen}
        credential={credential}
        onClose={() => setCredentialOpen(false)}
        onClosed={closeCredential}
      />
      <ConfirmModal {...confirmProps} />
    </ListPage>
  );
};
