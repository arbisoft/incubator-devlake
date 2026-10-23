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
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { Form } from '.';

type Fields = ComponentProps<typeof Form>['fields'];

const renderForm = (type: 'create' | 'update', fields: Fields) => {
  const setValues = vi.fn();
  const setErrors = vi.fn();
  renderWithTheme(
    <Form
      type={type}
      name="test"
      fields={fields}
      initialValues={{}}
      values={{}}
      errors={{}}
      setValues={setValues}
      setErrors={setErrors}
    />,
  );
  return { setValues, setErrors };
};

const isKeyWarning = (args: unknown[]) =>
  String(args[0]).includes('A props object containing a "key" prop') || String(args[0]).includes('unique "key" prop');

describe('connection form fields', () => {
  it('renders object and unkeyed function fields without React key warnings', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderForm('create', ['name', { key: 'endpoint' }, () => <span>one</span>, () => <span>two</span>]);

    expect(consoleError.mock.calls.filter(isKeyWarning)).toEqual([]);
    consoleError.mockRestore();
  });

  it('keeps the form type when a field option sets its own type', () => {
    renderForm('update', [{ key: 'token', type: 'password' }]);
    expect(screen.getByPlaceholderText('********')).toBeTruthy();

    const { setErrors } = renderForm('create', [{ key: 'token', type: 'password' }]);
    const merged = setErrors.mock.calls.map(([update]) => update).reduce((prev, update) => update(prev), {});
    expect(merged).toEqual({ token: 'token is required' });
  });
});
