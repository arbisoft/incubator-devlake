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
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { FormField } from './form-field';

const LABEL = 'Key name';
const HINT = 'Give the key a unique name.';

describe('FormField', () => {
  it('names the control by its label', () => {
    renderWithTheme(<FormField label={LABEL}>{(control) => <input {...control} />}</FormField>);
    expect(screen.getByRole('textbox', { name: LABEL })).toBeTruthy();
  });

  it('describes the control with the hint', () => {
    renderWithTheme(
      <FormField label={LABEL} description={HINT}>
        {(control) => <input {...control} />}
      </FormField>,
    );
    expect(screen.getByRole('textbox', { name: LABEL }).getAttribute('aria-describedby')).toBe(
      screen.getByText(HINT).id,
    );
  });

  it('marks a required control without adding the asterisk to its name', () => {
    renderWithTheme(
      <FormField label={LABEL} required>
        {(control) => <input {...control} />}
      </FormField>,
    );
    const input = screen.getByRole('textbox', { name: LABEL });
    expect(input.getAttribute('aria-required')).toBe('true');
  });

  it('raises the required mark above the label baseline', () => {
    const { container } = renderWithTheme(
      <FormField label={LABEL} required>
        {(control) => <input {...control} />}
      </FormField>,
    );
    expect(getComputedStyle(container.querySelector('label span') as Element).verticalAlign).toBe('super');
  });

  it('adds no description or required attributes when they are not given', () => {
    renderWithTheme(<FormField label={LABEL}>{(control) => <input {...control} />}</FormField>);
    const input = screen.getByRole('textbox', { name: LABEL });
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(input.hasAttribute('aria-required')).toBe(false);
  });
});
