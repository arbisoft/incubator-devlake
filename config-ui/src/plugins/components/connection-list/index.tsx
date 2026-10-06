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

import { EyeOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Table, Button, Modal } from 'antd';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

import { PATHS } from '@/config';
import { selectConnections } from '@/features/connections';
import { useAppSelector } from '@/hooks';
import { getPluginConfig, ConnectionStatus, ConnectionForm } from '@/plugins';
import { WebHookConnection } from '@/plugins/register/webhook';
import { PluginIcon } from '@/ui';

const ModalTitle = styled.div`
  display: flex;
  align-items: center;

  gap: 8px;
`;

interface Props {
  plugin: string;
  onCreate: () => void;
}

export const ConnectionList = ({ plugin, onCreate }: Props) => {
  const [open, setOpen] = useState(false);
  const [connectionId, setConnectionId] = useState<ID>();

  const pluginConfig = useMemo(() => getPluginConfig(plugin), [plugin]);

  const connections = useAppSelector((state) => selectConnections(state, plugin));

  const navigate = useNavigate();

  if (plugin === 'webhook') {
    return <WebHookConnection />;
  }

  const handleShowForm = (id: ID) => {
    setOpen(true);
    setConnectionId(id);
  };

  const hanldeHideForm = () => {
    setOpen(false);
    setConnectionId(undefined);
  };

  return (
    <>
      <Table
        rowKey="id"
        size="small"
        columns={[
          {
            title: 'Connection Name',
            dataIndex: 'name',
            key: 'name',
          },
          {
            title: 'Status',
            key: 'status',
            width: 200,
            render: (_, row) => <ConnectionStatus connection={row} />,
          },
          {
            title: '',
            key: 'link',
            width: 200,
            render: (_, { plugin, id }) => (
              <>
                <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(PATHS.CONNECTION(plugin, id))}>
                  Details
                </Button>
                <Button type="link" icon={<EditOutlined />} onClick={() => handleShowForm(id)}>
                  Edit
                </Button>
              </>
            ),
          },
        ]}
        dataSource={connections}
        pagination={false}
      />
      <Button style={{ marginTop: 16 }} type="primary" icon={<PlusOutlined />} onClick={() => onCreate()}>
        Create a New Connection
      </Button>
      <Modal
        destroyOnClose
        open={open}
        width={820}
        centered
        title={
          <ModalTitle>
            <PluginIcon icon={pluginConfig.icon} size="md" />
            <span className="name">Manage Connections: {pluginConfig.name}</span>
          </ModalTitle>
        }
        footer={null}
        onCancel={hanldeHideForm}
      >
        <ConnectionForm plugin={plugin} connectionId={connectionId} onSuccess={hanldeHideForm} />
      </Modal>
    </>
  );
};
