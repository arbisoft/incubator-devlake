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

import { PROVIDER_ID } from './constants';
import { PROVIDER_LOGOS } from './logos';
import { ProviderLogo } from './provider-logo';

describe('ProviderLogo', () => {
  it('shows the provider mark with its alt text for a known issuer host', () => {
    renderWithTheme(<ProviderLogo issuerHost="accounts.google.com" />);
    const image = screen.getByRole('img', { name: PROVIDER_LOGOS[PROVIDER_ID.GOOGLE].alt });
    expect(image.getAttribute('src')).toBe(PROVIDER_LOGOS[PROVIDER_ID.GOOGLE].src);
  });

  it('falls back to a hidden key icon for an unknown host', () => {
    const { container } = renderWithTheme(<ProviderLogo issuerHost="sso.example.com" />);
    expect(screen.queryByRole('img', { name: /logo/i })).toBeNull();
    expect(container.querySelector('.anticon-key')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('falls back when the backend sends no host', () => {
    const { container } = renderWithTheme(<ProviderLogo />);
    expect(container.querySelector('.anticon-key')).not.toBeNull();
  });
});
