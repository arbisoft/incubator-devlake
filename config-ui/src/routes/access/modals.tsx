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

import { Button, Input, Modal, Select } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { CopyToClipboard } from 'react-copy-to-clipboard';

import type { AccessRole } from '@/api/access';
import { Block, Message } from '@/components';

import { ROLE_OPTIONS } from './constants';
import { isValidDomain, isValidEmail } from './utils';

export type CreateUserModalProps = {
  open: boolean;
  email: string;
  role: AccessRole;
  emailError?: string;
  operating: boolean;
  onEmailChange: (email: string) => void;
  onRoleChange: (role: AccessRole) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export const CreateUserModal = ({
  open,
  email,
  role,
  emailError,
  operating,
  onEmailChange,
  onRoleChange,
  onCancel,
  onSubmit,
}: CreateUserModalProps) => {
  if (!open) return null;

  return (
    <Modal
      open
      title="Add DevLake user"
      onCancel={onCancel}
      onOk={onSubmit}
      okText="Add"
      okButtonProps={{ loading: operating, disabled: !isValidEmail(email) }}
    >
      <Block title="Email" required>
        <Input
          value={email}
          placeholder="person@example.com"
          status={emailError ? 'error' : undefined}
          onChange={(event) => onEmailChange(event.target.value)}
        />
      </Block>
      {emailError && <Message content={emailError} />}
      <Block title="Role" required>
        <Select value={role} options={ROLE_OPTIONS} onChange={onRoleChange} style={{ width: '100%' }} />
      </Block>
      <Message content="The person is authorized after their first verified sign-in with the configured OIDC provider." />
    </Modal>
  );
};

export type CreateLocalUserModalProps = {
  open: boolean;
  loginName: string;
  displayName: string;
  role: AccessRole;
  loginNameError?: string;
  operating: boolean;
  onLoginNameChange: (loginName: string) => void;
  onDisplayNameChange: (displayName: string) => void;
  onRoleChange: (role: AccessRole) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export const CreateLocalUserModal = ({
  open,
  loginName,
  displayName,
  role,
  loginNameError,
  operating,
  onLoginNameChange,
  onDisplayNameChange,
  onRoleChange,
  onCancel,
  onSubmit,
}: CreateLocalUserModalProps) => {
  if (!open) return null;

  return (
    <Modal
      open
      title="Add local DevLake user"
      onCancel={onCancel}
      onOk={onSubmit}
      okText="Create"
      okButtonProps={{ loading: operating, disabled: Boolean(loginNameError) || !loginName }}
    >
      <Block title="Username" required>
        <Input
          value={loginName}
          placeholder="person"
          status={loginNameError ? 'error' : undefined}
          onChange={(event) => onLoginNameChange(event.target.value)}
        />
      </Block>
      {loginNameError && <Message content={loginNameError} />}
      <Block title="Name">
        <Input value={displayName} onChange={(event) => onDisplayNameChange(event.target.value)} />
      </Block>
      <Block title="Role" required>
        <Select value={role} options={ROLE_OPTIONS} onChange={onRoleChange} style={{ width: '100%' }} />
      </Block>
      <Message content="DevLake generates a temporary password. The person must change it after their first sign-in." />
    </Modal>
  );
};

export type AddLocalCredentialModalProps = {
  open: boolean;
  loginName: string;
  loginNameError?: string;
  operating: boolean;
  onLoginNameChange: (loginName: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export const AddLocalCredentialModal = ({
  open,
  loginName,
  loginNameError,
  operating,
  onLoginNameChange,
  onCancel,
  onSubmit,
}: AddLocalCredentialModalProps) => {
  if (!open) return null;
  return (
    <Modal
      open
      title="Add local password"
      onCancel={onCancel}
      onOk={onSubmit}
      okText="Generate password"
      okButtonProps={{ loading: operating, disabled: Boolean(loginNameError) || !loginName }}
    >
      <Block title="Username" required>
        <Input
          value={loginName}
          placeholder="person"
          status={loginNameError ? 'error' : undefined}
          onChange={(event) => onLoginNameChange(event.target.value)}
        />
      </Block>
      {loginNameError && <Message content={loginNameError} />}
      <Message content="DevLake generates a temporary password. The person must change it after their first sign-in." />
    </Modal>
  );
};

export type TemporaryPasswordModalProps = {
  open: boolean;
  loginName: string;
  temporaryPassword: string;
  onClose: () => void;
};

export const TemporaryPasswordModal = ({
  open,
  loginName,
  temporaryPassword,
  onClose,
}: TemporaryPasswordModalProps) => {
  if (!open) return null;
  return (
    <Modal
      open
      title="Temporary password"
      footer={<Button onClick={onClose}>Done</Button>}
      closable={false}
      maskClosable={false}
    >
      <Message content="Copy this password now. It is shown only once and must be changed after sign-in." />
      <Block title={`Password for ${loginName}`}>
        <Input
          readOnly
          value={temporaryPassword}
          addonAfter={
            <CopyToClipboard text={temporaryPassword}>
              <Button type="text" icon={<CopyOutlined />} aria-label="Copy temporary password" />
            </CopyToClipboard>
          }
        />
      </Block>
    </Modal>
  );
};

export type CreateDomainModalProps = {
  open: boolean;
  domain: string;
  role: AccessRole;
  domainError?: string;
  operating: boolean;
  onDomainChange: (domain: string) => void;
  onRoleChange: (role: AccessRole) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export const CreateDomainModal = ({
  open,
  domain,
  role,
  domainError,
  operating,
  onDomainChange,
  onRoleChange,
  onCancel,
  onSubmit,
}: CreateDomainModalProps) => {
  if (!open) return null;

  return (
    <Modal
      open
      title="Allow email domain"
      onCancel={onCancel}
      onOk={onSubmit}
      okText="Allow"
      okButtonProps={{ loading: operating, disabled: !isValidDomain(domain) }}
    >
      <Block title="Domain" required>
        <Input
          value={domain}
          placeholder="example.com"
          status={domainError ? 'error' : undefined}
          onChange={(event) => onDomainChange(event.target.value)}
        />
      </Block>
      {domainError && <Message content={domainError} />}
      <Block title="Default role" required>
        <Select value={role} options={ROLE_OPTIONS} onChange={onRoleChange} style={{ width: '100%' }} />
      </Block>
      <Message content="People with verified email addresses at this domain are created as DevLake users on first sign-in." />
    </Modal>
  );
};
