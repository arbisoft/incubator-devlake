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

import { describe, expect, it } from 'vitest';

import { ACCESS_ROLE } from '@/api/access';
import { ROLE_OPTIONS } from '@/routes/settings/constants';

import { COPY } from './constants';
import type { LayoutUser } from './types';
import { getAccountLabels } from './utils';

const USER: LayoutUser = {
  authenticated: true,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  authenticationMethod: 'local',
};

describe('getAccountLabels', () => {
  it('shows the name, with the role as the secondary line when access control is on', () => {
    expect(getAccountLabels(USER, { enabled: true, role: ACCESS_ROLE.CUSTOMER_ADMIN })).toEqual({
      name: USER.name,
      secondary: ROLE_OPTIONS.find((option) => option.value === ACCESS_ROLE.CUSTOMER_ADMIN)?.label,
    });
  });

  it('falls back to the email as the secondary line without a role', () => {
    expect(getAccountLabels(USER, null)).toEqual({ name: USER.name, secondary: USER.email });
    expect(getAccountLabels(USER, { enabled: false })).toEqual({ name: USER.name, secondary: USER.email });
  });

  it('uses the email as the name when there is no name, and does not repeat it', () => {
    expect(getAccountLabels({ ...USER, name: '' }, null)).toEqual({ name: USER.email, secondary: '' });
  });

  it('uses the generic account name with no secondary line when nobody is signed in', () => {
    const empty = { name: COPY.account.fallbackName, secondary: '' };
    expect(getAccountLabels(null, null)).toEqual(empty);
    expect(getAccountLabels({ ...USER, authenticated: false }, { enabled: true, role: ACCESS_ROLE.MEMBER })).toEqual(
      empty,
    );
    expect(getAccountLabels({ ...USER, name: '', email: '' }, null)).toEqual({
      name: COPY.account.fallbackName,
      secondary: '',
    });
  });
});
