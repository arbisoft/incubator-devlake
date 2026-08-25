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

import { useState } from 'react';
import { Button, Flex, Input, Modal, Select, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

import API from '@/api';
import { Block, Message, PageHeader } from '@/components';
import { useRefreshData } from '@/hooks';
import { operator } from '@/utils';
import {
  ACCESS_ROLE,
  ACCESS_STATUS,
  type AccessAuditEvent,
  type AccessDomain,
  type AccessRole,
  type AccessStatus,
  type AccessUser,
} from '@/api/access';

const PATH_PREFIX = import.meta.env.DEVLAKE_PATH_PREFIX ?? '';
const accessPath = `${PATH_PREFIX}/access`;
const roleOptions = [
  { value: ACCESS_ROLE.MEMBER, label: 'Member' },
  { value: ACCESS_ROLE.CUSTOMER_ADMIN, label: 'Customer administrator' },
];

type ModalState = 'user' | 'domain' | undefined;

export const Access = () => {
  const [version, setVersion] = useState(0);
  const [modal, setModal] = useState<ModalState>();
  const [operating, setOperating] = useState(false);
  const [email, setEmail] = useState('');
  const [domain, setDomain] = useState('');
  const [role, setRole] = useState<AccessRole>(ACCESS_ROLE.MEMBER);
  const { data, ready } = useRefreshData(
    () => Promise.all([API.access.listUsers(), API.access.listDomains(), API.access.listAuditEvents()]),
    [version],
  );
  const [users, domains, auditEvents] = data ?? [[], [], []];

  const refresh = () => setVersion((current) => current + 1);
  const closeModal = () => {
    setModal(undefined);
    setEmail('');
    setDomain('');
    setRole(ACCESS_ROLE.MEMBER);
  };

  const createUser = async () => {
    const [success] = await operator(() => API.access.createUser({ email, role }), { setOperating });
    if (success) {
      closeModal();
      refresh();
    }
  };

  const createDomain = async () => {
    const [success] = await operator(() => API.access.createDomain({ domain, defaultRole: role }), { setOperating });
    if (success) {
      closeModal();
      refresh();
    }
  };

  const updateUser = async (user: AccessUser, nextStatus: AccessStatus) => {
    const [success] = await operator(() => API.access.updateUser(user.id, { role: user.role, status: nextStatus }));
    if (success) refresh();
  };

  const updateUserRole = async (user: AccessUser, nextRole: AccessRole) => {
    const [success] = await operator(() => API.access.updateUser(user.id, { role: nextRole, status: user.status }));
    if (success) refresh();
  };

  const updateDomain = async (accessDomain: AccessDomain, nextStatus: AccessStatus) => {
    const [success] = await operator(() =>
      API.access.updateDomain(accessDomain.id, { defaultRole: accessDomain.defaultRole, status: nextStatus }),
    );
    if (success) refresh();
  };

  const updateDomainRole = async (accessDomain: AccessDomain, nextRole: AccessRole) => {
    const [success] = await operator(() =>
      API.access.updateDomain(accessDomain.id, { defaultRole: nextRole, status: accessDomain.status }),
    );
    if (success) refresh();
  };

  return (
    <PageHeader
      breadcrumbs={[{ name: 'Access', path: accessPath }]}
      description="Manage who can access DevLake. Grafana access remains independently managed in Grafana."
    >
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>People</h3>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal('user')}>
          Add person
        </Button>
      </Flex>
      <Table
        rowKey="id"
        size="middle"
        loading={!ready}
        dataSource={users}
        pagination={false}
        columns={[
          { title: 'Email', dataIndex: 'email', key: 'email' },
          {
            title: 'Name',
            dataIndex: 'displayName',
            key: 'displayName',
            render: (value: string) => value || 'Pending first login',
          },
          {
            title: 'Role',
            dataIndex: 'role',
            key: 'role',
            render: (value: AccessRole, user: AccessUser) => (
              <Select
                size="small"
                value={value}
                options={roleOptions}
                onChange={(nextRole) => updateUserRole(user, nextRole)}
              />
            ),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (value: AccessStatus) => (
              <Tag color={value === ACCESS_STATUS.ACTIVE ? 'green' : 'default'}>{value}</Tag>
            ),
          },
          {
            title: '',
            key: 'actions',
            width: 120,
            render: (_: unknown, user: AccessUser) => (
              <Button
                size="small"
                danger={user.status === ACCESS_STATUS.ACTIVE}
                onClick={() =>
                  updateUser(user, user.status === ACCESS_STATUS.ACTIVE ? ACCESS_STATUS.DISABLED : ACCESS_STATUS.ACTIVE)
                }
              >
                {user.status === ACCESS_STATUS.ACTIVE ? 'Disable' : 'Enable'}
              </Button>
            ),
          },
        ]}
      />

      <Flex justify="space-between" align="center" style={{ margin: '32px 0 16px' }}>
        <h3 style={{ margin: 0 }}>Allowed domains</h3>
        <Button icon={<PlusOutlined />} onClick={() => setModal('domain')}>
          Add domain
        </Button>
      </Flex>
      <Table
        rowKey="id"
        size="middle"
        loading={!ready}
        dataSource={domains}
        pagination={false}
        columns={[
          { title: 'Domain', dataIndex: 'domain', key: 'domain' },
          {
            title: 'Default role',
            dataIndex: 'defaultRole',
            key: 'defaultRole',
            render: (value: AccessRole, accessDomain: AccessDomain) => (
              <Select
                size="small"
                value={value}
                options={roleOptions}
                onChange={(nextRole) => updateDomainRole(accessDomain, nextRole)}
              />
            ),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (value: AccessStatus) => (
              <Tag color={value === ACCESS_STATUS.ACTIVE ? 'green' : 'default'}>{value}</Tag>
            ),
          },
          {
            title: '',
            key: 'actions',
            width: 120,
            render: (_: unknown, accessDomain: AccessDomain) => (
              <Button
                size="small"
                danger={accessDomain.status === ACCESS_STATUS.ACTIVE}
                onClick={() =>
                  updateDomain(
                    accessDomain,
                    accessDomain.status === ACCESS_STATUS.ACTIVE ? ACCESS_STATUS.DISABLED : ACCESS_STATUS.ACTIVE,
                  )
                }
              >
                {accessDomain.status === ACCESS_STATUS.ACTIVE ? 'Disable' : 'Enable'}
              </Button>
            ),
          },
        ]}
      />

      <h3 style={{ margin: '32px 0 16px' }}>Recent access activity</h3>
      <Table
        rowKey="id"
        size="middle"
        loading={!ready}
        dataSource={auditEvents}
        pagination={false}
        columns={[
          { title: 'When', dataIndex: 'createdAt', key: 'createdAt' },
          { title: 'Action', dataIndex: 'action', key: 'action' },
          {
            title: 'Actor',
            dataIndex: 'actorEmail',
            key: 'actorEmail',
            render: (value: string) => value || 'System',
          },
          {
            title: 'Target',
            dataIndex: 'targetEmail',
            key: 'targetEmail',
            render: (value: string) => value || '-',
          },
          { title: 'Detail', dataIndex: 'detail', key: 'detail' },
        ]}
      />

      {modal === 'user' && (
        <Modal
          open
          title="Add DevLake user"
          onCancel={closeModal}
          onOk={createUser}
          okText="Add"
          okButtonProps={{ loading: operating, disabled: !email }}
        >
          <Block title="Email" required>
            <Input value={email} placeholder="person@example.com" onChange={(event) => setEmail(event.target.value)} />
          </Block>
          <Block title="Role" required>
            <Select value={role} options={roleOptions} onChange={setRole} style={{ width: '100%' }} />
          </Block>
          <Message content="The person is authorized after their first verified sign-in with the configured OIDC provider." />
        </Modal>
      )}
      {modal === 'domain' && (
        <Modal
          open
          title="Allow email domain"
          onCancel={closeModal}
          onOk={createDomain}
          okText="Allow"
          okButtonProps={{ loading: operating, disabled: !domain }}
        >
          <Block title="Domain" required>
            <Input value={domain} placeholder="example.com" onChange={(event) => setDomain(event.target.value)} />
          </Block>
          <Block title="Default role" required>
            <Select value={role} options={roleOptions} onChange={setRole} style={{ width: '100%' }} />
          </Block>
          <Message content="People with verified email addresses at this domain are created as DevLake users on first sign-in." />
        </Modal>
      )}
    </PageHeader>
  );
};
