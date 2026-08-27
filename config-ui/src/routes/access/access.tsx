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
import { Button, Input, Modal, Popconfirm, Select, Space, Table, Tag, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';

import API from '@/api';
import { Block, Message, PageHeader } from '@/components';
import { useRefreshData } from '@/hooks';
import { operator } from '@/utils';
import {
  ACCESS_ROLE,
  ACCESS_STATUS,
  type AccessDomain,
  type AccessRole,
  type AccessStatus,
  type AccessUser,
} from '@/api/access';

import { ACCESS_PATH, ACCESS_STATUS_COLOR, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from './constants';
import { SectionHeader, SectionTitle } from './styled';
import { getCreateDomainError, getCreateUserError, isValidDomain, isValidEmail, normalizeDomain } from './utils';

const roleOptions = [
  { value: ACCESS_ROLE.MEMBER, label: 'Member' },
  { value: ACCESS_ROLE.CUSTOMER_ADMIN, label: 'Customer administrator' },
];

type ModalState = 'user' | 'domain' | undefined;

export const Access = () => {
  const [version, setVersion] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(DEFAULT_PAGE_SIZE);
  const [domainPage, setDomainPage] = useState(1);
  const [domainPageSize, setDomainPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(DEFAULT_PAGE_SIZE);
  const [modal, setModal] = useState<ModalState>();
  const [operating, setOperating] = useState(false);
  const [email, setEmail] = useState('');
  const [domain, setDomain] = useState('');
  const [role, setRole] = useState<AccessRole>(ACCESS_ROLE.MEMBER);
  const { data, ready } = useRefreshData(
    () =>
      Promise.all([
        API.access.listUsers({ page: userPage, pageSize: userPageSize }),
        API.access.listDomains({ page: domainPage, pageSize: domainPageSize }),
        API.access.listAuditEvents(),
      ]),
    [version, userPage, userPageSize, domainPage, domainPageSize],
  );
  const [users, domains, auditEvents] = data ?? [undefined, undefined, []];
  const normalizedDomain = normalizeDomain(domain);
  const domainError =
    domain.length > 0 && !isValidDomain(domain) ? 'Enter a valid email domain, such as example.com.' : '';
  const emailError =
    email.length > 0 && !isValidEmail(email) ? 'Enter a valid email address, such as person@example.com.' : '';

  const refresh = () => setVersion((current) => current + 1);
  const closeModal = () => {
    setModal(undefined);
    setEmail('');
    setDomain('');
    setRole(ACCESS_ROLE.MEMBER);
  };

  const createUser = async () => {
    const [success] = await operator(() => API.access.createUser({ email: email.trim().toLowerCase(), role }), {
      setOperating,
      formatReason: getCreateUserError,
    });
    if (success) {
      closeModal();
      refresh();
    }
  };

  const createDomain = async () => {
    const [success] = await operator(() => API.access.createDomain({ domain: normalizedDomain, defaultRole: role }), {
      setOperating,
      formatReason: getCreateDomainError,
    });
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

  const hideUser = async (user: AccessUser) => {
    const [success] = await operator(() => API.access.hideUser(user.id));
    if (success) refresh();
  };

  const hideDomain = async (accessDomain: AccessDomain) => {
    const [success] = await operator(() => API.access.hideDomain(accessDomain.id));
    if (success) refresh();
  };

  return (
    <PageHeader
      breadcrumbs={[{ name: 'User Management', path: ACCESS_PATH }]}
      description="Manage who can access DevLake. Grafana access remains independently managed in Grafana."
    >
      <SectionHeader>
        <SectionTitle>People</SectionTitle>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal('user')}>
          Add person
        </Button>
      </SectionHeader>
      <Table
        rowKey="id"
        size="middle"
        loading={!ready}
        dataSource={users?.users ?? []}
        pagination={{
          current: userPage,
          pageSize: userPageSize,
          total: users?.count ?? 0,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          showSizeChanger: true,
          onChange: (nextPage, nextPageSize) => {
            if (nextPageSize && nextPageSize !== userPageSize) {
              setUserPageSize(nextPageSize as (typeof PAGE_SIZE_OPTIONS)[number]);
              setUserPage(1);
              return;
            }
            setUserPage(nextPage);
          },
        }}
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
            render: (value: AccessStatus) => <Tag color={ACCESS_STATUS_COLOR[value]}>{value}</Tag>,
          },
          {
            title: '',
            key: 'actions',
            width: 160,
            render: (_: unknown, user: AccessUser) => (
              <Space size="small">
                <Button
                  size="small"
                  danger={user.status === ACCESS_STATUS.ACTIVE}
                  onClick={() =>
                    updateUser(
                      user,
                      user.status === ACCESS_STATUS.ACTIVE ? ACCESS_STATUS.DISABLED : ACCESS_STATUS.ACTIVE,
                    )
                  }
                >
                  {user.status === ACCESS_STATUS.ACTIVE ? 'Disable' : 'Enable'}
                </Button>
                <Popconfirm
                  title="Remove this person from User Management?"
                  description="Their DevLake access will be disabled and the record will remain in audit history."
                  okText="Remove"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => hideUser(user)}
                >
                  <Tooltip title="Remove person from User Management">
                    <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove person" />
                  </Tooltip>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <SectionHeader $spaced>
        <SectionTitle>Allowed domains</SectionTitle>
        <Button icon={<PlusOutlined />} onClick={() => setModal('domain')}>
          Add domain
        </Button>
      </SectionHeader>
      <Table
        rowKey="id"
        size="middle"
        loading={!ready}
        dataSource={domains?.domains ?? []}
        pagination={{
          current: domainPage,
          pageSize: domainPageSize,
          total: domains?.count ?? 0,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          showSizeChanger: true,
          onChange: (nextPage, nextPageSize) => {
            if (nextPageSize && nextPageSize !== domainPageSize) {
              setDomainPageSize(nextPageSize as (typeof PAGE_SIZE_OPTIONS)[number]);
              setDomainPage(1);
              return;
            }
            setDomainPage(nextPage);
          },
        }}
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
            render: (value: AccessStatus) => <Tag color={ACCESS_STATUS_COLOR[value]}>{value}</Tag>,
          },
          {
            title: '',
            key: 'actions',
            width: 160,
            render: (_: unknown, accessDomain: AccessDomain) => (
              <Space size="small">
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
                <Popconfirm
                  title="Remove this domain from User Management?"
                  description="New sign-ins from this domain will no longer be provisioned. The record will remain in audit history."
                  okText="Remove"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => hideDomain(accessDomain)}
                >
                  <Tooltip title="Remove domain from User Management">
                    <Button type="text" danger icon={<DeleteOutlined />} aria-label="Remove domain" />
                  </Tooltip>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <SectionHeader $spaced>
        <SectionTitle>Recent access activity</SectionTitle>
      </SectionHeader>
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
          okButtonProps={{ loading: operating, disabled: !isValidEmail(email) }}
        >
          <Block title="Email" required>
            <Input
              value={email}
              placeholder="person@example.com"
              status={emailError ? 'error' : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Block>
          {emailError && <Message content={emailError} />}
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
          okButtonProps={{ loading: operating, disabled: !isValidDomain(domain) }}
        >
          <Block title="Domain" required>
            <Input
              value={domain}
              placeholder="example.com"
              status={domainError ? 'error' : undefined}
              onChange={(event) => setDomain(event.target.value)}
            />
          </Block>
          {domainError && <Message content={domainError} />}
          <Block title="Default role" required>
            <Select value={role} options={roleOptions} onChange={setRole} style={{ width: '100%' }} />
          </Block>
          <Message content="People with verified email addresses at this domain are created as DevLake users on first sign-in." />
        </Modal>
      )}
    </PageHeader>
  );
};
