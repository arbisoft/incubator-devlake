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
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { ROW_LINK_VARIANT } from './constants';
import { RowLink } from './row-link';

describe('RowLink', () => {
  it('links to the route and keeps the router state', () => {
    renderWithTheme(
      <MemoryRouter>
        <RowLink to="/projects/alpha">alpha</RowLink>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'alpha' }).getAttribute('href')).toBe('/projects/alpha');
  });

  it('is not underlined until hovered', () => {
    renderWithTheme(
      <MemoryRouter>
        <RowLink to="/a" variant={ROW_LINK_VARIANT.LINK}>
          linked
        </RowLink>
      </MemoryRouter>,
    );
    expect(getComputedStyle(screen.getByRole('link', { name: 'linked' })).textDecorationLine).toBe('none');
  });

  it('colours the link variant differently from the default text colour', () => {
    renderWithTheme(
      <MemoryRouter>
        <RowLink to="/a">plain</RowLink>
        <RowLink to="/b" variant={ROW_LINK_VARIANT.LINK}>
          linked
        </RowLink>
      </MemoryRouter>,
    );
    const colour = (name: string) => getComputedStyle(screen.getByRole('link', { name })).color;
    expect(colour('linked')).not.toBe(colour('plain'));
  });
});
