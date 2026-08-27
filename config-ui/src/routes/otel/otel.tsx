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

import { useMemo, useState } from 'react';
import { PlusOutlined } from '@ant-design/icons';
import { Button, Flex, message, Table } from 'antd';

import API from '@/api';
import { type OtelConnectionResponse } from '@/api/otel';
import { Message, PageHeader } from '@/components';
import { useRefreshData } from '@/hooks';
import { operator, type OperateConfig } from '@/utils';
import { getOtelColumns } from './columns';
import { OTEL_ERROR, OTEL_LIFECYCLE_ACTION } from './constants';
import { OTEL_MODAL, OtelModals, type OtelLifecycleAction, type OtelModalState } from './modals';
import {
  getOtelCreateError,
  getOtelLifecycleError,
  hasRecoveryRequired,
  hasStorageNeedsApplying,
  notifyOtelAttentionChanged,
} from './utils';

// Avoid importing PATHS here: config/paths imports the routes barrel, which also exports this module.
const OTEL_PATH = `${import.meta.env.DEVLAKE_PATH_PREFIX ?? ''}/otel`;
const BREADCRUMBS = [{ name: 'Claude Code OTel', path: OTEL_PATH }];

type OtelOperationResult = { success: true; data: OtelConnectionResponse } | { success: false; error: unknown };

// Keep OTel lifecycle responses typed without changing the shared legacy operator contract.
const operateOtel = async (
  request: () => Promise<OtelConnectionResponse>,
  config?: OperateConfig,
): Promise<OtelOperationResult> => {
  const [success, result] = await operator(request, config);
  return success ? { success: true, data: result as OtelConnectionResponse } : { success: false, error: result };
};

export const Otel = () => {
  const [version, setVersion] = useState(1);
  const [operating, setOperating] = useState(false);
  const [modal, setModal] = useState<OtelModalState>();
  const [current, setCurrent] = useState<OtelConnectionResponse>();
  const [teamName, setTeamName] = useState('');
  const [createError, setCreateError] = useState<string>();
  const [lifecycleError, setLifecycleError] = useState<string>();

  const { data, ready } = useRefreshData(() => API.otel.list(), [version]);
  const dataSource = useMemo(() => data ?? [], [data]);
  const columns = useMemo(() => getOtelColumns(setCurrent, setModal), []);
  const managedSettings = useMemo(
    () => (current?.managedSettings ? JSON.stringify(current.managedSettings, null, 2) : ''),
    [current],
  );

  const refresh = () => setVersion((v) => v + 1);
  const closeModal = () => {
    setLifecycleError(undefined);
    setModal(undefined);
  };

  const handleCreate = async () => {
    setCreateError(undefined);
    const result = await operateOtel(() => API.otel.create({ teamName }), { hideToast: true, setOperating });
    if (result.success) {
      setCurrent(result.data);
      setTeamName('');
      setModal(OTEL_MODAL.SNIPPET);
      refresh();
      notifyOtelAttentionChanged();
      return;
    }

    setCreateError(getOtelCreateError(result.error));
  };

  const handleAction = async (action: OtelLifecycleAction) => {
    if (!current?.connection.id) return;
    setLifecycleError(undefined);
    const apiCalls: Record<OtelLifecycleAction, () => Promise<OtelConnectionResponse>> = {
      [OTEL_LIFECYCLE_ACTION.ROTATE]: () => API.otel.rotate(current.connection.id),
      [OTEL_LIFECYCLE_ACTION.REVOKE]: () => API.otel.revoke(current.connection.id),
      [OTEL_LIFECYCLE_ACTION.HIDE]: () => API.otel.hide(current.connection.id),
      [OTEL_LIFECYCLE_ACTION.FINALIZE]: () => API.otel.finalizeRotation(current.connection.id),
      [OTEL_LIFECYCLE_ACTION.APPLY]: () => API.otel.apply(current.connection.id),
    };

    const result = await operateOtel(apiCalls[action], { hideToast: true, setOperating });
    if (!result.success) {
      setLifecycleError(getOtelLifecycleError(result.error));
      return;
    }

    const response = result.data;
    setCurrent(response);
    refresh();
    notifyOtelAttentionChanged();
    const postActionHandlers: Partial<Record<OtelLifecycleAction, (response: OtelConnectionResponse) => boolean>> = {
      [OTEL_LIFECYCLE_ACTION.HIDE]: () => {
        setModal(undefined);
        return true;
      },
      [OTEL_LIFECYCLE_ACTION.APPLY]: (response) => {
        if (response.restartRequired) {
          setLifecycleError(response.restartHint || OTEL_ERROR.APPLY);
          return true;
        }
        message.success('Credential changes applied.');
        return false;
      },
    };
    if (postActionHandlers[action]?.(response)) return;

    setModal(response.managedSettings ? OTEL_MODAL.SNIPPET : undefined);
  };

  return (
    <PageHeader
      breadcrumbs={BREADCRUMBS}
      description="Generate and manage the Basic Auth credential used by Claude Code telemetry."
    >
      <Flex style={{ marginBottom: 16 }} justify="flex-end">
        <Button type="primary" icon={<PlusOutlined />} loading={operating} onClick={() => setModal(OTEL_MODAL.CREATE)}>
          Generate Claude Settings
        </Button>
      </Flex>
      {hasRecoveryRequired(dataSource) && (
        <Message content="The Collector credential verifier is unavailable. Revoke the affected connection, then generate new Claude settings to restore telemetry." />
      )}
      {hasStorageNeedsApplying(dataSource) && (
        <Message content="Credential storage differs from the registered credentials. Select Apply to reconcile the telemetry endpoint." />
      )}
      <Table
        rowKey={(record) => record.connection.id}
        size="middle"
        loading={!ready}
        dataSource={dataSource}
        columns={columns}
      />

      <OtelModals
        modal={modal}
        current={current}
        teamName={teamName}
        createError={createError}
        lifecycleError={lifecycleError}
        operating={operating}
        managedSettings={managedSettings}
        onClose={closeModal}
        onCreate={handleCreate}
        onTeamNameChange={setTeamName}
        onClearCreateError={() => setCreateError(undefined)}
        onAction={handleAction}
      />
    </PageHeader>
  );
};
