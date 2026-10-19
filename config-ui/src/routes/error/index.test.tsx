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
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { LINKS } from '@/config';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from './constants';

import { ErrorPage } from './index';

const ERROR_DETAIL = 'service detail';

let activeRouter: ReturnType<typeof createMemoryRouter> | undefined;

const renderThrownError = (error: unknown) => {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <div />,
        loader: () => {
          throw error;
        },
        errorElement: <ErrorPage />,
      },
    ],
    { initialEntries: ['/'] },
  );
  activeRouter = router;
  return renderWithTheme(<RouterProvider router={router} />);
};

const renderRouteError = (status: number) => renderThrownError(new Response(ERROR_DETAIL, { status }));

describe('ErrorPage', () => {
  afterEach(() => {
    activeRouter?.dispose();
    activeRouter = undefined;
  });

  it.each([404, 500])('shows a safe title for an HTTP %s route error', async (status) => {
    renderRouteError(status);

    expect(await screen.findByText(COPY.requestFailed(status))).toBeTruthy();
    expect(screen.queryByText(ERROR_DETAIL)).toBeNull();
    expect(screen.getByRole('button', { name: COPY.continue })).toBeTruthy();
    expect(screen.getByRole('link', { name: COPY.github }).getAttribute('href')).toBe(LINKS.GITHUB);
  });

  it('uses generic copy for unexpected Error details', async () => {
    renderThrownError(new Error(ERROR_DETAIL));

    expect(await screen.findByText(COPY.unknown)).toBeTruthy();
    expect(screen.queryByText(ERROR_DETAIL)).toBeNull();
  });

  it('uses generic copy for unexpected object details', async () => {
    renderThrownError({ message: ERROR_DETAIL });

    expect(await screen.findByText(COPY.unknown)).toBeTruthy();
    expect(screen.queryByText(ERROR_DETAIL)).toBeNull();
    expect(screen.queryByText('[object Object]')).toBeNull();
  });
});
