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

import { Input, Modal, Select } from 'antd';

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
