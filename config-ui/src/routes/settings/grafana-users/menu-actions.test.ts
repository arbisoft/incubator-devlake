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

import { describe, expect, it, vi } from 'vitest';

import { GRAFANA_ERROR_CODE, GRAFANA_ROLE } from '@/api/grafana-users/constants';
import type { GrafanaUser } from '@/api/grafana-users/types';

import { COPY, GRAFANA_FLOW_ERRORS, GRAFANA_MENU_ACTION } from './constants';
import { getMenuActions, getRowIconActions } from './utils';

const EMAIL = 'ann@example.com';

const user: GrafanaUser = {
  id: 1,
  email: EMAIL,
  name: 'Ann',
  role: GRAFANA_ROLE.VIEWER,
  disabled: false,
  sso: false,
  protected: false,
  projects: [],
};

describe('getMenuActions', () => {
  it('offers details and password for a normal account', () => {
    expect(getMenuActions(user)).toEqual([GRAFANA_MENU_ACTION.DETAILS, GRAFANA_MENU_ACTION.PASSWORD]);
  });

  it('offers details and password for an SSO account and nothing for a protected one', () => {
    expect(getMenuActions({ ...user, sso: true })).toEqual([GRAFANA_MENU_ACTION.DETAILS, GRAFANA_MENU_ACTION.PASSWORD]);
    expect(getMenuActions({ ...user, protected: true })).toEqual([]);
  });
});

describe('getRowIconActions', () => {
  const onMenuAction = vi.fn();

  it('maps each menu action to a labelled icon action that reports it', () => {
    const actions = getRowIconActions(user, { onMenuAction });
    expect(actions.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: GRAFANA_MENU_ACTION.DETAILS, label: COPY.actions.editDetailsFor(EMAIL) },
      { key: GRAFANA_MENU_ACTION.PASSWORD, label: COPY.actions.setPasswordFor(EMAIL) },
    ]);
    actions[1].onClick();
    expect(onMenuAction).toHaveBeenCalledWith(user, GRAFANA_MENU_ACTION.PASSWORD);
    expect(actions.some(({ disabledReason }) => disabledReason !== undefined)).toBe(false);
  });

  it('marks the password action of an SSO account disabled with the SSO reason and never reports it', () => {
    const onSsoMenuAction = vi.fn();
    const actions = getRowIconActions({ ...user, sso: true }, { onMenuAction: onSsoMenuAction });
    expect(actions.map(({ key, disabledReason }) => ({ key, disabledReason }))).toEqual([
      { key: GRAFANA_MENU_ACTION.DETAILS, disabledReason: undefined },
      {
        key: GRAFANA_MENU_ACTION.PASSWORD,
        disabledReason: GRAFANA_FLOW_ERRORS.PASSWORD[GRAFANA_ERROR_CODE.USER_SSO_MANAGED],
      },
    ]);
    actions[1].onClick();
    expect(onSsoMenuAction).not.toHaveBeenCalled();
  });
});
