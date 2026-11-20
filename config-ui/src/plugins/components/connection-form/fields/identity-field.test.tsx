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

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { IdentityField } from './identity-field';

type V = { organization?: string };

const setup = (overrides: { values?: V; initialValues?: V; validate?: (v: V) => string } = {}) => {
  const setValues = vi.fn();
  const setErrors = vi.fn();
  renderWithTheme(
    <IdentityField<V>
      fieldKey="organization"
      errorKey="scopeIdentity"
      title="Organization"
      description="Pick one"
      placeholder="e.g. github"
      validate={overrides.validate ?? (() => '')}
      initialValues={overrides.initialValues ?? {}}
      values={overrides.values ?? {}}
      setValues={setValues}
      setErrors={setErrors}
    />,
  );
  return { setValues, setErrors };
};

describe('IdentityField', () => {
  it('seeds the initial value through setValues', () => {
    const { setValues } = setup({ initialValues: { organization: 'acme' } });
    expect(setValues).toHaveBeenCalledWith({ organization: 'acme' });
  });

  it('seeds an empty string when there is no initial value', () => {
    const { setValues } = setup();
    expect(setValues).toHaveBeenCalledWith({ organization: '' });
  });

  it('reports the validation result and shows it', () => {
    const { setErrors } = setup({ validate: () => 'Organization is required' });
    expect(setErrors).toHaveBeenCalledWith({ scopeIdentity: 'Organization is required' });
    expect(screen.getByText('Organization is required')).toBeTruthy();
  });

  it('reports an empty error and shows nothing when valid', () => {
    const { setErrors } = setup();
    expect(setErrors).toHaveBeenCalledWith({ scopeIdentity: '' });
    expect(screen.queryByText('Organization is required')).toBeNull();
  });

  it('writes typed input to the field key', () => {
    const { setValues } = setup({ values: { organization: 'a' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. github'), { target: { value: 'acme' } });
    expect(setValues).toHaveBeenLastCalledWith({ organization: 'acme' });
  });
});
