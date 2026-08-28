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

import { CheckOutlined, DeleteOutlined, ReloadOutlined, StopOutlined, SyncOutlined } from '@ant-design/icons';
import { Button, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import { OTEL_CONNECTION_STATUS, OTEL_CREDENTIAL_STATUS, type OtelConnectionResponse } from '@/api/otel';
import { formatTime } from '@/utils';
import { OTEL_MODAL, type OtelModalState } from './modals';
import { getOtelConnectionStatus } from './utils';
import { OTEL_CONNECTION_DISPLAY_STATUS } from './constants';

export const getOtelColumns = (
  setCurrent: (connection: OtelConnectionResponse) => void,
  setModal: (modal: OtelModalState) => void,
  onManageProjects: (connection: OtelConnectionResponse) => void,
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
    title: 'Projects',
    width: 260,
    render: (_, record) => (
      <Space wrap>
        {record.projects.map((project) => (
          <Tag key={project.name}>{project.name}</Tag>
        ))}
        {record.projects.length > 1 && <Tag color="blue">shared</Tag>}
      </Space>
    ),
  },
  {
    title: 'Endpoint',
    dataIndex: ['connection', 'collectorEndpoint'],
  },
  {
    title: 'Status',
    width: 180,
    render: (_, record) => {
      const status = getOtelConnectionStatus(record);
      return <Tag color={status === OTEL_CONNECTION_DISPLAY_STATUS.READY ? 'green' : 'default'}>{status}</Tag>;
    },
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
        <Button size="small" onClick={() => onManageProjects(record)}>
          Projects
        </Button>
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
