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
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from './constants';

import { NotFound, ShellNotFound } from './index';

const navigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const renderPage = (page: JSX.Element) => renderWithTheme(<MemoryRouter>{page}</MemoryRouter>);

describe('ShellNotFound', () => {
  it('shows the heading and a home action, and the home action leaves the page', () => {
    renderPage(<ShellNotFound />);
    expect(screen.getByText(COPY.heading)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: COPY.home }));
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('renders the same content as NotFound without the standalone page around it', () => {
    const shell = renderPage(<ShellNotFound />);
    const shellHtml = shell.container.innerHTML;
    shell.unmount();
    const standalone = renderPage(<NotFound />);
    expect(standalone.container.innerHTML).toContain(shellHtml);
    expect(standalone.container.innerHTML.length).toBeGreaterThan(shellHtml.length);
  });
});
