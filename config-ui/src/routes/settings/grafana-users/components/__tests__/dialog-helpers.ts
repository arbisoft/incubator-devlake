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

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';
import { expect, vi } from 'vitest';

import { GRAFANA_ERROR_CODE, GRAFANA_ROLE } from '@/api/grafana-users/constants';
import type { GrafanaUser } from '@/api/grafana-users/types';

import { COPY } from '../../constants';

export const EMAIL = 'ann@example.com';

export const user = (patch: Partial<GrafanaUser> = {}): GrafanaUser => ({
  id: 5,
  email: EMAIL,
  name: 'Ann Lee',
  role: GRAFANA_ROLE.VIEWER,
  disabled: false,
  sso: false,
  protected: false,
  projects: [],
  ...patch,
});

export const callbacks = () => ({ onClose: vi.fn(), onChanged: vi.fn(), onPassword: vi.fn() });

export const submit = (name: string) => screen.getByRole('button', { name: new RegExp(`${name}$`) });

export const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });

export const USER_NOT_FOUND_ERROR = {
  response: { status: 404, data: { code: GRAFANA_ERROR_CODE.USER_NOT_FOUND } },
};

export const expectRejectedAndKept = async (props: ReturnType<typeof callbacks>) => {
  await waitFor(() => expect(message.error).toHaveBeenCalledWith(COPY.errors[GRAFANA_ERROR_CODE.USER_NOT_FOUND]));
  expect(props.onChanged).toHaveBeenCalledTimes(1);
  expect(props.onClose).not.toHaveBeenCalled();
  expect(props.onPassword).not.toHaveBeenCalled();
};
