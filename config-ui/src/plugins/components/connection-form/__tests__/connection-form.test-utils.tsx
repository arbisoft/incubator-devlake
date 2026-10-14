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

import type { Dispatch, SetStateAction } from 'react';
import { vi } from 'vitest';

import API from '@/api';
import { withMockedMessage } from '@/ui/__tests__/mock-message';

import type { ConnectionFormType, ConnectionFormValues } from '../types';

const mocks = vi.hoisted(() => {
  const defaultEndpoint = 'default-endpoint';
  return {
    connection: undefined as Record<string, unknown> | undefined,
    defaultEndpoint,
    updatedEndpoint: 'updated-endpoint',
    savedEndpoint: 'saved-endpoint',
    savedName: 'Saved connection',
    successMessage: 'Connection accepted',
    pluginConfig: {
      name: 'GitLab',
      connection: { docLink: '', fields: ['endpoint'], initialValues: { endpoint: defaultEndpoint } },
    } as {
      name: string;
      connection: {
        docLink: string;
        fields: string[];
        initialValues: Record<string, unknown>;
        showTestResultMessage?: boolean;
      };
    },
    dispatch: vi.fn(),
    addConnection: vi.fn((payload: Record<string, unknown>) => payload),
    updateConnection: vi.fn((payload: Record<string, unknown>) => payload),
    save: vi.fn(),
  };
});

vi.mock('@/api', () => ({
  default: {
    connection: { get: vi.fn(), test: vi.fn(), testOld: vi.fn() },
  },
}));

vi.mock('@/features', () => ({
  addConnection: mocks.addConnection,
  updateConnection: mocks.updateConnection,
}));

vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useAppDispatch: () => mocks.dispatch,
  useAppSelector: () => mocks.connection,
}));

vi.mock('@/plugins/utils', () => ({ getPluginConfig: () => mocks.pluginConfig }));

vi.mock('../fields', async () => {
  const React = await import('react');
  return {
    Form: ({
      initialValues,
      values,
      setValues,
    }: {
      type: ConnectionFormType;
      connectionId?: ID;
      name: string;
      fields: string[];
      initialValues: ConnectionFormValues;
      values: ConnectionFormValues;
      errors: Record<string, unknown>;
      setValues: Dispatch<SetStateAction<ConnectionFormValues>>;
      setErrors: Dispatch<SetStateAction<Record<string, unknown>>>;
    }) => {
      React.useEffect(() => {
        if (initialValues.endpoint) {
          setValues((current) => (current.endpoint ? current : { ...current, endpoint: initialValues.endpoint }));
        }
      }, [initialValues.endpoint, setValues]);
      return (
        <div>
          <button
            type="button"
            onClick={() => setValues((current) => ({ ...current, endpoint: mocks.updatedEndpoint }))}
          >
            Change endpoint
          </button>
          <span data-testid="endpoint-value">{String(values.endpoint ?? '')}</span>
        </div>
      );
    },
  };
});

vi.mock('antd', async (importOriginal) => withMockedMessage(await importOriginal<typeof import('antd')>()));

export const testOld = vi.mocked(API.connection.testOld);
export const test = vi.mocked(API.connection.test);
export const get = vi.mocked(API.connection.get);
export { mocks };

export const setPluginConfig = (showTestResultMessage = false) => {
  mocks.pluginConfig = {
    name: 'GitLab',
    connection: {
      docLink: '',
      fields: ['endpoint'],
      initialValues: { endpoint: mocks.defaultEndpoint },
      showTestResultMessage,
    },
  };
};

export const resetConnectionFormMocks = () => {
  vi.resetAllMocks();
  mocks.connection = undefined;
  mocks.dispatch.mockImplementation(() => ({ unwrap: () => mocks.save() }));
  setPluginConfig();
};
