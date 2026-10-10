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

import { USER_MANAGEMENT_VIEW } from '@/config';

import { COPY } from './constants';
import { getUserManagementViews, toUserManagementView } from './utils';

describe('user management views', () => {
  it('lists DevLake first, on the bare users route, and Grafana on its own route', () => {
    expect(getUserManagementViews()).toEqual([
      { key: USER_MANAGEMENT_VIEW.DEVLAKE, label: COPY.views.devlake, path: '/settings/users' },
      { key: USER_MANAGEMENT_VIEW.GRAFANA, label: COPY.views.grafana, path: '/settings/users/grafana' },
    ]);
  });

  it('shows every view', () => {
    expect(getUserManagementViews().every(({ visible }) => visible !== false)).toBe(true);
  });

  it('falls back to DevLake for an unknown or missing view', () => {
    expect(toUserManagementView(USER_MANAGEMENT_VIEW.GRAFANA)).toBe(USER_MANAGEMENT_VIEW.GRAFANA);
    expect(toUserManagementView('other')).toBe(USER_MANAGEMENT_VIEW.DEVLAKE);
    expect(toUserManagementView(undefined)).toBe(USER_MANAGEMENT_VIEW.DEVLAKE);
  });
});
