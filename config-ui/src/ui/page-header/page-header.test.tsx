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

import { COPY } from './constants';
import { PageHeader } from './page-header';

const TITLE = 'Platform';
const CRUMBS = [{ label: 'Projects', path: '/projects' }, { label: TITLE }];

const setup = (props: Partial<Parameters<typeof PageHeader>[0]> = {}) =>
  renderWithTheme(
    <MemoryRouter>
      <PageHeader title={TITLE} breadcrumbs={CRUMBS} {...props} />
    </MemoryRouter>,
  );

describe('PageHeader', () => {
  it('renders the title as the page heading', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeTruthy();
  });

  it('omits the heading when the title is hidden and keeps the breadcrumbs and document title', () => {
    setup({ showTitle: false });
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByRole('navigation', { name: COPY.breadcrumb }).textContent).toContain(TITLE);
    expect(document.title).toContain(TITLE);
  });

  it('keeps the actions when the title is hidden', () => {
    setup({ showTitle: false, actions: <button type="button">Add</button> });
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
});
