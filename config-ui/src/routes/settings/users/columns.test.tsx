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

import { screen } from '@testing-library/react';
import { Table } from 'antd';
import { describe, expect, it, vi } from 'vitest';

import { ACCESS_ROLE, ACCESS_STATUS, type AccessDomain, type AccessUser } from '@/api/access';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from '../constants';

import { getDomainColumns, getUserColumns } from './columns';
import type { DomainColumnActions, UserColumnActions } from './types';

const ADA_EMAIL = 'ada@example.com';
const BOB_EMAIL = 'bob@example.com';
const ADA: AccessUser = {
  id: 1,
  issuer: 'issuer',
  subject: 'ada',
  email: ADA_EMAIL,
  displayName: 'Ada',
  role: ACCESS_ROLE.MEMBER,
  status: ACCESS_STATUS.ACTIVE,
  hasLocalCredential: false,
};
const BOB: AccessUser = { ...ADA, id: 2, subject: 'bob', email: BOB_EMAIL, displayName: 'Bob' };
const DOMAIN_A: AccessDomain = {
  id: 1,
  domain: 'a.example.com',
  defaultRole: ACCESS_ROLE.MEMBER,
  status: ACCESS_STATUS.ACTIVE,
};
const DOMAIN_B: AccessDomain = { ...DOMAIN_A, id: 2, domain: 'b.example.com' };

const userActions = (patch: Partial<UserColumnActions> = {}): UserColumnActions => ({
  onRoleChange: vi.fn(),
  onStatusChange: vi.fn(),
  onRemove: vi.fn(),
  onAddLocalCredential: vi.fn(),
  onResetLocalCredential: vi.fn(),
  onRemoveLocalCredential: vi.fn(),
  localAuthEnabled: false,
  statusFilter: { options: [] },
  ...patch,
});

const roleSelect = (name: string) => screen.getByRole('combobox', { name }) as HTMLInputElement;

describe('DevLake user columns', () => {
  it('disables the role select of the pending user only', () => {
    const columns = getUserColumns(userActions({ isRolePending: (user) => user.id === ADA.id }));
    renderWithTheme(<Table rowKey="id" pagination={false} columns={columns} dataSource={[ADA, BOB]} />);
    expect(roleSelect(COPY.users.roleFor(ADA_EMAIL)).disabled).toBe(true);
    expect(roleSelect(COPY.users.roleFor(BOB_EMAIL)).disabled).toBe(false);
  });

  it('leaves every role select enabled without a pending check', () => {
    renderWithTheme(
      <Table rowKey="id" pagination={false} columns={getUserColumns(userActions())} dataSource={[ADA]} />,
    );
    expect(roleSelect(COPY.users.roleFor(ADA_EMAIL)).disabled).toBe(false);
  });
});

describe('DevLake domain columns', () => {
  it('disables the default role select of the pending domain only', () => {
    const actions: DomainColumnActions = {
      onRoleChange: vi.fn(),
      onStatusChange: vi.fn(),
      onRemove: vi.fn(),
      isRolePending: (domain) => domain.id === DOMAIN_A.id,
    };
    renderWithTheme(
      <Table rowKey="id" pagination={false} columns={getDomainColumns(actions)} dataSource={[DOMAIN_A, DOMAIN_B]} />,
    );
    expect(roleSelect(COPY.domains.roleFor('a.example.com')).disabled).toBe(true);
    expect(roleSelect(COPY.domains.roleFor('b.example.com')).disabled).toBe(false);
  });
});
