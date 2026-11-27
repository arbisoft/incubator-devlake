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

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import { Form } from '@/plugins/components/connection-form/fields';
import type { ConnectionFieldErrors, ConnectionFieldValues } from '@/types';
import { COMMON_COPY } from '@/ui';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { ACCESS_KEY_SETUP, ASSUME_ROLE_SETUP, EXTERNAL_ID } from '../__tests__/fixtures';
import { AwsConfig } from '../config';
import { AWS_AUTH_TYPE, COPY } from '../constants';

vi.mock('@/api', () => ({ default: { plugin: { aws: { setup: vi.fn() } } } }));

const setup = vi.mocked(API.plugin.aws.setup);
const { credentials } = COPY;
const defaults = AwsConfig.connection.initialValues ?? {};
const SAVED = { ...defaults, name: 'e2e-aws', accessKeyId: 'AKIA****', regions: ['us-east-2'] };

type HarnessProps = { type: 'create' | 'update'; connectionId?: number; saved?: ConnectionFieldValues };

const Harness = ({ type, connectionId, saved = {} }: HarnessProps) => {
  const [values, setValues] = useState<ConnectionFieldValues>({});
  const [errors, setErrors] = useState<ConnectionFieldErrors>({});
  return (
    <>
      <Form
        type={type}
        connectionId={connectionId}
        name={COPY.pluginName}
        fields={AwsConfig.connection.fields}
        initialValues={{ ...defaults, ...saved }}
        values={values}
        errors={errors}
        setValues={setValues}
        setErrors={setErrors}
      />
      <output>{JSON.stringify(values)}</output>
    </>
  );
};

const renderCreate = (saved?: ConnectionFieldValues) => renderWithTheme(<Harness type="create" saved={saved} />);
const renderEdit = (saved: ConnectionFieldValues = SAVED) =>
  renderWithTheme(<Harness type="update" connectionId={7} saved={saved} />);

const labelOptions = { exact: false };
const chooseAuth = (label: string) => fireEvent.click(screen.getByRole('radio', { name: label }));
const authLabel = (authType: string) => COPY.authType.options.find((option) => option.value === authType)?.label ?? '';

describe('aws connection fields', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setup.mockResolvedValue(ASSUME_ROLE_SETUP);
  });

  it('shows the broker key and the role ARN for assume role', () => {
    renderCreate();

    const { accessKeyId, secretAccessKey, roleArn, sessionToken } = credentials;
    expect(screen.getByLabelText(accessKeyId[AWS_AUTH_TYPE.ASSUME_ROLE].label, labelOptions)).toBeTruthy();
    expect(screen.getByText(secretAccessKey[AWS_AUTH_TYPE.ASSUME_ROLE].label)).toBeTruthy();
    expect(screen.getByLabelText(roleArn.label, labelOptions)).toBeTruthy();
    expect(screen.queryByLabelText(sessionToken.label, labelOptions)).toBeNull();
  });

  it('shows the access key and the session token for access key', () => {
    renderCreate();
    chooseAuth(authLabel(AWS_AUTH_TYPE.ACCESS_KEY));

    const { accessKeyId, secretAccessKey, roleArn, sessionToken } = credentials;
    expect(screen.getByLabelText(accessKeyId[AWS_AUTH_TYPE.ACCESS_KEY].label, labelOptions)).toBeTruthy();
    expect(screen.getByText(secretAccessKey[AWS_AUTH_TYPE.ACCESS_KEY].label)).toBeTruthy();
    expect(screen.getByLabelText(sessionToken.label, labelOptions)).toBeTruthy();
    expect(screen.queryByLabelText(roleArn.label, labelOptions)).toBeNull();
  });

  it('makes the role ARN required on edit only', async () => {
    const { unmount } = renderCreate();
    expect(screen.queryByText(credentials.roleArn.required)).toBeNull();
    unmount();

    renderEdit();
    expect(await screen.findByText(credentials.roleArn.required)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(credentials.roleArn.label, labelOptions), {
      target: { value: 'arn:aws:iam::123456789012:role/devlake' },
    });
    await waitFor(() => expect(screen.queryByText(credentials.roleArn.required)).toBeNull());
  });

  it('requires a region only once the field is edited and rejects a malformed one', async () => {
    renderCreate();
    expect(screen.queryByText(COPY.regions.required)).toBeNull();

    const input = screen.getByRole('combobox', { name: COPY.regions.label });
    fireEvent.change(input, { target: { value: 'nowhere' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(await screen.findByText(COPY.regions.invalid('nowhere'))).toBeTruthy();

    const removeTag = document.querySelector('.ant-select-selection-item-remove');
    if (removeTag) fireEvent.click(removeTag);
    expect(await screen.findByText(COPY.regions.required)).toBeTruthy();
  });

  it('turns Cost Explorer on and keeps it off by default', () => {
    renderCreate();
    const toggle = screen.getByRole('switch', { name: COPY.costExplorer.label });
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('keeps an untouched secret out of the form values on edit', () => {
    renderEdit();

    expect(screen.queryByText(/secretAccessKey/)).toBeNull();
    fireEvent.change(screen.getByLabelText(credentials.accessKeyId[AWS_AUTH_TYPE.ASSUME_ROLE].label, labelOptions), {
      target: { value: 'AKIANEWKEY' },
    });
    expect(screen.getByRole('status').textContent).toContain('AKIANEWKEY');
  });
});

describe('aws setup panel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setup.mockResolvedValue(ASSUME_ROLE_SETUP);
  });

  it('only tells a new connection to save first', () => {
    renderCreate();

    expect(screen.getByText(COPY.setup.createInfo[AWS_AUTH_TYPE.ASSUME_ROLE])).toBeTruthy();
    expect(screen.queryByText(COPY.setup.externalId.label)).toBeNull();
    expect(setup).not.toHaveBeenCalled();
  });

  it('shows the read-only External ID, the policies and the permissions of a saved assume-role connection', async () => {
    renderEdit();

    expect(await screen.findByText(EXTERNAL_ID)).toBeTruthy();
    expect(setup).toHaveBeenCalledWith(7, expect.any(AbortSignal));
    expect(screen.getByRole('button', { name: COPY.setup.externalId.copy })).toBeTruthy();
    expect(screen.queryByDisplayValue(EXTERNAL_ID)).toBeNull();
    expect(screen.getByText(/TrustBroker/)).toBeTruthy();
    expect(screen.getByText(/AssumeRole/)).toBeTruthy();
    expect(screen.getByText(/ReadPipelines/)).toBeTruthy();
    const permissions = screen.getByRole('table', { name: COPY.setup.permissions.ariaLabel });
    expect(within(permissions).getByText('codepipeline:ListPipelines')).toBeTruthy();
    expect(screen.queryByText(COPY.setup.brokerPlaceholder)).toBeNull();
  });

  it('shows only the permission policy for an access-key connection', async () => {
    setup.mockResolvedValue(ACCESS_KEY_SETUP);
    renderEdit({ ...SAVED, authType: AWS_AUTH_TYPE.ACCESS_KEY });

    expect(await screen.findByText(COPY.setup.permissionPolicy.label)).toBeTruthy();
    expect(screen.queryByText(COPY.setup.externalId.label)).toBeNull();
    expect(screen.queryByText(COPY.setup.trustPolicy.label)).toBeNull();
    expect(screen.queryByText(COPY.setup.brokerPolicy.label)).toBeNull();
  });

  it('warns when the broker ARN is a placeholder', async () => {
    setup.mockResolvedValue({ ...ASSUME_ROLE_SETUP, brokerArnResolved: false });
    renderEdit();

    expect(await screen.findByText(COPY.setup.brokerPlaceholder)).toBeTruthy();
  });

  it('shows an inline error with a retry that loads the panel', async () => {
    setup.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(ASSUME_ROLE_SETUP);
    renderEdit();

    expect(await screen.findByText(COPY.setup.loadFailed)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: COMMON_COPY.retry }));

    expect(await screen.findByText(EXTERNAL_ID)).toBeTruthy();
  });
});
