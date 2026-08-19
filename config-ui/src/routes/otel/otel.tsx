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
import { PlusOutlined, ReloadOutlined, StopOutlined, CheckOutlined, SyncOutlined, DeleteOutlined } from '@ant-design/icons';
import { Button, Flex, message, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';

import API from '@/api';
import { OTEL_CONNECTION_STATUS, OTEL_CREDENTIAL_STATUS, type OtelConnectionResponse } from '@/api/otel';
import { Message, PageHeader } from '@/components';
import { useRefreshData } from '@/hooks';
import { formatTime, operator } from '@/utils';
import { OTEL_MODAL, OtelModals, type OtelLifecycleAction, type OtelModalState } from './modals';

const OTEL_PATH = `${import.meta.env.DEVLAKE_PATH_PREFIX ?? ''}/otel`;
const BREADCRUMBS = [{ name: 'Claude Code OTel', path: OTEL_PATH }];
const duplicateTeamMessage = 'Claude Code OTel credentials already exist for this team. Revoke them before generating new settings.';
const genericCreateError = 'Unable to generate Claude settings. Please try again or contact support.';
const genericApplyError = 'Credential changes were saved, but the telemetry endpoint could not apply them. Retry Apply shortly.';
const credentialStorageError = 'Telemetry credential storage is temporarily unavailable. Please retry shortly.';
const genericLifecycleError = 'Unable to update Claude Code OTel credentials. Please try again or contact support.';

// Surface only explicit validation messages; unexpected backend failures remain generic.
const getCreateError = (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 503) return credentialStorageError;
  if (!axios.isAxiosError<{ message?: unknown }>(error) || error.response?.status !== 400) return genericCreateError;

  const message = typeof error.response.data?.message === 'string' ? error.response.data.message : '';
  if (message.includes('a Claude Code OTel connection already exists for this team')) return duplicateTeamMessage;

  return message || genericCreateError;
};

// Surface only known operational responses; filesystem details and stack traces stay server-side.
const getLifecycleError = (error: unknown) => {
  if (!axios.isAxiosError<{ message?: unknown }>(error)) return genericLifecycleError;

  const { status, data } = error.response ?? {};
  if (status === 503) return credentialStorageError;

  const message = typeof data?.message === 'string' ? data.message : '';
  if (status === 400 || status === 409 || status === 429) return message || genericLifecycleError;

  return genericLifecycleError;
};

// Keep table presentation separate while leaving page-specific actions in this route.
const getColumns = (
  setCurrent: (connection: OtelConnectionResponse) => void,
  setModal: (modal: OtelModalState) => void,
): ColumnsType<OtelConnectionResponse> => [
  {
    title: 'Team',
    dataIndex: ['connection', 'teamName'],
    width: 220,
  },
  {
    title: 'Team slug',
    dataIndex: ['connection', 'teamSlug'],
    width: 220,
  },
  {
    title: 'Endpoint',
    dataIndex: ['connection', 'collectorEndpoint'],
  },
  {
    title: 'Status',
    width: 180,
    render: (_, record) => (
      <Space>
        <Tag
          color={
            record.connection.status === OTEL_CONNECTION_STATUS.ACTIVE && !record.restartRequired ? 'green' : 'default'
          }
        >
          {record.connection.status === OTEL_CONNECTION_STATUS.REVOKED
            ? 'Revoked'
            : record.restartRequired
            ? 'Action required'
            : 'Ready'}
        </Tag>
      </Space>
    ),
  },
  {
    title: 'Credentials',
    width: 220,
    render: (_, record) => {
      const currentCredentials = record.credentials.filter(
        (credential) => credential.status !== OTEL_CREDENTIAL_STATUS.REVOKED,
      );

      return (
        <Space wrap>
          {currentCredentials.length > 0 ? (
            currentCredentials.map((credential) => (
              <Tag key={credential.id} color={credential.status === OTEL_CREDENTIAL_STATUS.ACTIVE ? 'green' : 'orange'}>
                {credential.status}
              </Tag>
            ))
          ) : (
            <Tag>revoked</Tag>
          )}
        </Space>
      );
    },
  },
  {
    title: 'Updated',
    dataIndex: ['connection', 'updatedAt'],
    width: 180,
    render: (value) => formatTime(value),
  },
  {
    title: '',
    width: 250,
    render: (_, record) => (
      <Space wrap>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          disabled={
            record.connection.status !== OTEL_CONNECTION_STATUS.ACTIVE ||
            record.recoveryRequired ||
            record.credentials.some((it) => it.status === OTEL_CREDENTIAL_STATUS.RETIRING)
          }
          onClick={() => {
            setCurrent(record);
            setModal(OTEL_MODAL.ROTATE);
          }}
        >
          Rotate
        </Button>
        <Button
          size="small"
          icon={<SyncOutlined />}
          disabled={!record.restartRequired}
          onClick={() => {
            setCurrent(record);
            setModal(OTEL_MODAL.APPLY);
          }}
        >
          Apply
        </Button>
        <Button
          size="small"
          icon={<CheckOutlined />}
          disabled={!record.credentials.some((it) => it.status === OTEL_CREDENTIAL_STATUS.RETIRING)}
          onClick={() => {
            setCurrent(record);
            setModal(OTEL_MODAL.FINALIZE);
          }}
        >
          Finalize
        </Button>
        <Button
          size="small"
          danger
          icon={<StopOutlined />}
          disabled={record.connection.status !== OTEL_CONNECTION_STATUS.ACTIVE}
          onClick={() => {
            setCurrent(record);
            setModal(OTEL_MODAL.REVOKE);
          }}
        >
          Revoke
        </Button>
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          disabled={record.connection.status !== OTEL_CONNECTION_STATUS.REVOKED}
          onClick={() => {
            setCurrent(record);
            setModal(OTEL_MODAL.HIDE);
          }}
        >
          Remove
        </Button>
      </Space>
    ),
  },
];

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
  const columns = useMemo(() => getColumns(setCurrent, setModal), []);
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
    const [success, res] = await operator(() => API.otel.create({ teamName }), { hideToast: true, setOperating });
    if (success) {
      setCurrent(res);
      setTeamName('');
      setModal(OTEL_MODAL.SNIPPET);
      refresh();
      return;
    }

    setCreateError(getCreateError(res));
  };

  const handleAction = async (action: OtelLifecycleAction) => {
    if (!current?.connection.id) return;
    setLifecycleError(undefined);
    const apiCall = {
      rotate: () => API.otel.rotate(current.connection.id),
      revoke: () => API.otel.revoke(current.connection.id),
      hide: () => API.otel.hide(current.connection.id),
      finalize: () => API.otel.finalizeRotation(current.connection.id),
      apply: () => API.otel.apply(current.connection.id),
    }[action];

    const [success, res] = await operator(apiCall, { hideToast: true, setOperating });
    if (!success) {
      setLifecycleError(getLifecycleError(res));
      return;
    }

    setCurrent(res);
    refresh();
    if (action === 'hide') {
      setModal(undefined);
      return;
    }
    if (action === 'apply') {
      if (res.restartRequired) {
        setLifecycleError(res.restartHint || genericApplyError);
        return;
      }
      message.success('Credential changes applied.');
    }
    setModal(res.managedSettings ? OTEL_MODAL.SNIPPET : undefined);
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
      {dataSource.some((connection) => connection.recoveryRequired) && (
        <Message content="The Collector credential verifier is unavailable. Revoke the affected connection, then generate new Claude settings to restore telemetry." />
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
