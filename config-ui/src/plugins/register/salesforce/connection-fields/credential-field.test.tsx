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

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ConnectionFieldRenderProps } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import type { SalesforceConnectionValues } from '../types';

import { credentialField } from './credential-field';

const field = credentialField({
  key: 'refreshToken',
  title: 'Refresh Token',
  name: 'salesforce-refresh-token',
  placeholder: 'Salesforce refresh token',
  password: true,
  authMode: 'refresh_token',
  requiredMessage: 'Refresh token is required.',
});

const render = (values: SalesforceConnectionValues, errors: Record<string, string> = {}) => {
  const setValues = vi.fn();
  const setErrors = vi.fn();
  const props: ConnectionFieldRenderProps<SalesforceConnectionValues> = {
    type: 'create',
    initialValues: {},
    values,
    errors,
    setValues,
    setErrors,
  };
  renderWithTheme(<>{field(props)}</>);
  return { setValues, setErrors };
};

describe('credentialField', () => {
  it('renders nothing outside its auth mode', () => {
    render({ authMode: 'access_token' });
    expect(screen.queryByPlaceholderText('Salesforce refresh token')).toBeNull();
  });

  it('validates the refresh-token branch on change', () => {
    const { setValues, setErrors } = render({ authMode: 'refresh_token', clientId: 'id', clientSecret: 's' });
    fireEvent.change(screen.getByPlaceholderText('Salesforce refresh token'), { target: { value: 'tok' } });
    expect(setValues).toHaveBeenCalledWith({ refreshToken: 'tok' });
    expect(setErrors).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: '', clientId: '', clientSecret: '' }),
    );
  });

  it('shows the required message from errors', () => {
    render({ authMode: 'refresh_token' }, { refreshToken: 'required' });
    expect(screen.getByText('Refresh token is required.')).toBeTruthy();
  });
});
