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
import {
  CopyOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  CheckOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { Button, Flex, message, Modal, Space, Table, Tag } from 'antd';

import API from '@/api';
import type { OtelConnectionResponse } from '@/api/otel';
import { ExternalLink, Message, PageHeader } from '@/components';
import { PATHS } from '@/config';
import { useRefreshData } from '@/hooks';
import { formatTime, operator } from '@/utils';

type ModalState = 'snippet' | 'rotate' | 'revoke' | 'finalize' | 'apply';

export const Otel = () => {
  const [version, setVersion] = useState(1);
  const [operating, setOperating] = useState(false);
  const [modal, setModal] = useState<ModalState>();
  const [current, setCurrent] = useState<OtelConnectionResponse>();

  const { data, ready } = useRefreshData(() => API.otel.list(), [version]);
  const dataSource = useMemo(() => data ?? [], [data]);
  const managedSettings = useMemo(
    () => (current?.managedSettings ? JSON.stringify(current.managedSettings, null, 2) : ''),
    [current],
  );

  const refresh = () => setVersion((v) => v + 1);
  const closeModal = () => setModal(undefined);

  const handleCreate = async () => {
    const [success, res] = await operator(() => API.otel.create({ name: 'Claude Code OTel' }), { setOperating });
    if (success) {
      setCurrent(res);
      setModal('snippet');
      refresh();
    }
  };

  const handleAction = async (action: 'rotate' | 'revoke' | 'finalize' | 'apply') => {
    if (!current?.connection.id) return;
    const apiCall = {
      rotate: () => API.otel.rotate(current.connection.id),
      revoke: () => API.otel.revoke(current.connection.id),
      finalize: () => API.otel.finalizeRotation(current.connection.id),
      apply: () => API.otel.apply(current.connection.id),
    }[action];

    const [success, res] = await operator(apiCall, { setOperating });
    if (success) {
      setCurrent(res);
      setModal(res.managedSettings ? 'snippet' : undefined);
      refresh();
    }
  };

  return (
    <PageHeader
      breadcrumbs={[{ name: 'Claude Code OTel', path: PATHS.OTEL() }]}
      description="Generate and manage the Basic Auth credential used by Claude Code telemetry."
    >
      <Flex style={{ marginBottom: 16 }} justify="flex-end">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          loading={operating}
          disabled={dataSource.some((connection) => connection.connection.status === 'active')}
          onClick={handleCreate}
        >
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
        columns={[
          {
            title: 'Name',
            dataIndex: ['connection', 'name'],
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
                <Tag color={record.connection.status === 'active' && !record.restartRequired ? 'green' : 'default'}>
                  {record.connection.status === 'revoked'
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
              const currentCredentials = record.credentials.filter((credential) => credential.status !== 'revoked');

              return (
                <Space wrap>
                  {currentCredentials.length > 0 ? (
                    currentCredentials.map((credential) => (
                      <Tag key={credential.id} color={credential.status === 'active' ? 'green' : 'orange'}>
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
                    record.connection.status !== 'active' || record.credentials.some((it) => it.status === 'retiring')
                  }
                  onClick={() => {
                    setCurrent(record);
                    setModal('rotate');
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
                    setModal('apply');
                  }}
                >
                  Apply
                </Button>
                <Button
                  size="small"
                  icon={<CheckOutlined />}
                  disabled={!record.credentials.some((it) => it.status === 'retiring')}
                  onClick={() => {
                    setCurrent(record);
                    setModal('finalize');
                  }}
                >
                  Finalize
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<StopOutlined />}
                  disabled={record.connection.status !== 'active'}
                  onClick={() => {
                    setCurrent(record);
                    setModal('revoke');
                  }}
                >
                  Revoke
                </Button>
              </Space>
            ),
          },
        ]}
      />

      {modal === 'snippet' && (
        <Modal open width={900} centered title="Claude managed settings" footer={null} onCancel={closeModal}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Message content="Copy this now. DevLake does not store the generated password or Basic Auth header." />
            <Message content="Pasting this JSON replaces existing managed env settings, including any console exporter flags." />
            <pre
              style={{
                minHeight: 320,
                maxHeight: 520,
                overflow: 'auto',
                margin: 0,
                padding: 16,
                border: '1px solid #d9d9d9',
                borderRadius: 6,
                background: '#f7f8fa',
                whiteSpace: 'pre',
              }}
            >
              {managedSettings}
            </pre>
            <Flex justify="space-between" align="center">
              <Space direction="vertical" size={4}>
                <span>
                  Add this JSON in{' '}
                  <ExternalLink link="https://claude.ai/admin-settings/claude-code">Claude Code managed settings</ExternalLink>.
                </span>
                {current?.restartRequired && (
                  <Message content={current.restartHint || 'Telemetry settings were generated, but endpoint activation needs support attention.'} />
                )}
              </Space>
              <CopyToClipboard text={managedSettings} onCopy={() => message.success('Copy successfully.')}>
                <Button icon={<CopyOutlined />}>Copy</Button>
              </CopyToClipboard>
            </Flex>
          </Space>
        </Modal>
      )}

      {modal === 'rotate' && (
        <Modal
          open
          width={720}
          centered
          title="Rotate Claude Code OTel Credential"
          okText="Rotate"
          okButtonProps={{ loading: operating }}
          onCancel={closeModal}
          onOk={() => handleAction('rotate')}
        >
          <Message content="The old credential will stay valid as retiring until you finalize rotation." />
        </Modal>
      )}

      {modal === 'finalize' && (
        <Modal
          open
          width={720}
          centered
          title="Finalize Rotation"
          okText="Finalize"
          okButtonProps={{ loading: operating }}
          onCancel={closeModal}
          onOk={() => handleAction('finalize')}
        >
          <Message content="Retiring credentials will be removed after the telemetry endpoint applies the update." />
        </Modal>
      )}

      {modal === 'apply' && (
        <Modal
          open
          width={720}
          centered
          title="Apply Credential Changes"
          okText="Apply"
          okButtonProps={{ loading: operating }}
          onCancel={closeModal}
          onOk={() => handleAction('apply')}
        >
          <Message content="Retry applying the current credential state to the telemetry endpoint." />
        </Modal>
      )}

      {modal === 'revoke' && (
        <Modal
          open
          width={720}
          centered
          title="Revoke Claude Code OTel Credential"
          okText="Revoke"
          okButtonProps={{ loading: operating, danger: true }}
          onCancel={closeModal}
          onOk={() => handleAction('revoke')}
        >
          <Message content="All active Claude Code telemetry credentials for this connection will be rejected after the telemetry endpoint applies the update." />
        </Modal>
      )}
    </PageHeader>
  );
};
