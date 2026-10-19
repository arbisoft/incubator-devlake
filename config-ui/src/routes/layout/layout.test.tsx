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

import { act, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useRouteError } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from './constants';
import { Layout } from './layout';

const mocks = vi.hoisted(() => ({
  status: 'loading',
  error: null as unknown,
  dispatch: vi.fn(),
  init: vi.fn((plugins: string[]) => ({ type: 'test/init', payload: plugins })),
  loaderCalls: 0,
}));

vi.mock('@/features', () => ({
  init: mocks.init,
  selectStatus: () => mocks.status,
  selectError: () => mocks.error,
  selectThemeMode: () => 'light',
  setMode: (mode: string) => ({ type: 'theme/setMode', payload: mode }),
}));

vi.mock('@/hooks', () => ({
  useAppDispatch: () => mocks.dispatch,
  useAppSelector: (selector: () => unknown) => selector(),
}));

const RouteErrorProbe = () => {
  const error = useRouteError();
  return <div data-testid="route-error">{error instanceof Error ? `Error: ${error.message}` : 'Not an Error'}</div>;
};

let activeRouter: ReturnType<typeof createMemoryRouter> | undefined;

const renderLayout = () => {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        loader: () => {
          mocks.loaderCalls += 1;
          return { version: 'test', plugins: [`plugin-${mocks.loaderCalls}`], user: null, access: null };
        },
        element: <Layout />,
        errorElement: <RouteErrorProbe />,
        children: [{ index: true, element: <div>Layout child</div> }],
      },
    ],
    { initialEntries: ['/'] },
  );
  activeRouter = router;
  return renderWithTheme(<RouterProvider router={router} />);
};

describe('Layout initialization state', () => {
  beforeEach(() => {
    mocks.status = 'loading';
    mocks.error = null;
    mocks.loaderCalls = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    activeRouter?.dispose();
    activeRouter = undefined;
  });

  it('shows loading and initializes once when loader data changes after a search navigation', async () => {
    renderLayout();

    expect(await screen.findByText('Loading...')).toBeTruthy();
    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalledTimes(1));

    const router = activeRouter;
    if (!router) throw new Error('The layout router was not created.');
    await act(async () => router.navigate('/?refresh=1'));
    await waitFor(() => expect(mocks.loaderCalls).toBe(2));
    expect(mocks.init).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
  });

  it.each([null, { message: 'service detail' }])(
    'throws a safe Error when initialization has failed and its serialized error is %s',
    async (error) => {
      mocks.status = 'failed';
      mocks.error = error;
      renderLayout();

      const routeError = await screen.findByTestId('route-error');
      expect(routeError.textContent).toBe(`Error: ${COPY.initializationFailed}`);
      expect(screen.queryByText('service detail')).toBeNull();
    },
  );
});
