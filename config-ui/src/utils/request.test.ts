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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const axiosState = vi.hoisted(() => {
  const request = vi.fn<(config: unknown) => Promise<unknown>>();
  const get = vi.fn<(url: string) => Promise<unknown>>();
  const responseUse = vi.fn<(...args: unknown[]) => void>();
  const instance = { request, get, interceptors: { response: { use: responseUse } } };
  const create = vi.fn((_config: unknown) => instance);

  return { create, get, instance, request, responseUse };
});

vi.mock('axios', () => ({
  default: { create: axiosState.create },
}));

import { PATHS } from '@/config';

import { request } from './request';

const initialInstanceConfig = axiosState.create.mock.calls[0]?.[0];
const initialResponseErrorHandler = axiosState.responseUse.mock.calls[0]?.[1];

type RequestError = { response?: { status?: number }; config?: { url?: unknown } };
type ResponseHandler = (error: RequestError) => Promise<never>;
type CapturedRequestConfig = {
  method?: unknown;
  params?: unknown;
  data?: unknown;
  responseType?: unknown;
  headers?: unknown;
  signal: AbortSignal;
};
type CapturedInstanceConfig = {
  withCredentials?: unknown;
  xsrfCookieName?: unknown;
  xsrfHeaderName?: unknown;
};
type TestLocation = {
  pathname: string;
  search: string;
  replace: ReturnType<typeof vi.fn>;
};

let location: TestLocation;

const capturedRequestConfig = (index = 0): CapturedRequestConfig => {
  const config = axiosState.request.mock.calls[index]?.[0];
  if (typeof config !== 'object' || config === null) {
    throw new Error('The Axios request config was not captured.');
  }
  return config as CapturedRequestConfig;
};

const capturedInstanceConfig = (): CapturedInstanceConfig => {
  const config = initialInstanceConfig;
  if (typeof config !== 'object' || config === null) {
    throw new Error('The Axios instance config was not captured.');
  }
  return config as CapturedInstanceConfig;
};

const responseErrorHandler = (): ResponseHandler => {
  const handler = initialResponseErrorHandler;
  if (typeof handler !== 'function') {
    throw new Error('The Axios response error handler was not registered.');
  }
  return handler as ResponseHandler;
};

const rejectResponse = async (error: RequestError) => {
  await expect(responseErrorHandler()(error)).rejects.toBe(error);
};

const settleSessionCheck = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosState.request.mockResolvedValue({ data: undefined });
    axiosState.get.mockResolvedValue({ data: { authenticated: true } });
    location = { pathname: '/projects', search: '?keep=1', replace: vi.fn() };
    vi.stubGlobal('window', { location });
    vi.stubGlobal('localStorage', { getItem: vi.fn((_key: string): string | null => null) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps credential and CSRF settings on the shared Axios instance', () => {
    const config = capturedInstanceConfig();
    const credentialsEnabled = config.withCredentials === true;
    const csrfCookieConfigured = config.xsrfCookieName === 'devlake_csrf';
    const csrfHeaderConfigured = config.xsrfHeaderName === 'X-CSRF-Token';
    expect(credentialsEnabled).toBe(true);
    expect(csrfCookieConfigured).toBe(true);
    expect(csrfHeaderConfigured).toBe(true);
  });

  it.each([{ method: 'GET' }, { method: 'get' }] as const)(
    'keeps %s requests as query parameters',
    async ({ method }) => {
      const query = { page: 2 };
      await request('/projects', { method, data: query });

      const config = capturedRequestConfig();
      expect(config.params).toEqual(query);
      expect('data' in config).toBe(false);
    },
  );

  it('keeps non-GET requests as request bodies', async () => {
    const body = { name: 'project' };
    await request('/projects', { method: 'post', data: body });

    const config = capturedRequestConfig();
    expect(config.data).toEqual(body);
    expect('params' in config).toBe(false);
  });

  it('leaves the response type unset for existing callers', async () => {
    await request('/projects');

    const config = capturedRequestConfig();
    expect(config.method).toBe('get');
    const responseTypeUnset = config.responseType === undefined;
    expect(responseTypeUnset).toBe(true);
  });

  it('passes blob response types through the shared request', async () => {
    await request('/pipelines/9/logging.tar.gz', { responseType: 'blob' });

    const blobResponseTypeUsed = capturedRequestConfig().responseType === 'blob';
    expect(blobResponseTypeUsed).toBe(true);
  });

  it('keeps the access-token header without exposing its value in assertions', async () => {
    const testToken = 'safe-test-token';
    vi.mocked(localStorage.getItem).mockReturnValue(testToken);
    await request('/projects');

    const { headers } = capturedRequestConfig();
    const authorizationMatches =
      typeof headers === 'object' &&
      headers !== null &&
      'Authorization' in headers &&
      headers.Authorization === `Bearer ${testToken}`;
    expect(authorizationMatches).toBe(true);
    expect(localStorage.getItem).toHaveBeenCalledExactlyOnceWith('accessToken');
  });

  it('connects a caller abort to the request cancellation signal', async () => {
    const callerController = new AbortController();
    await request('/projects', { signal: callerController.signal });

    const requestSignal = capturedRequestConfig().signal;
    expect(requestSignal).toBeInstanceOf(AbortSignal);
    expect(requestSignal.aborted).toBe(false);
    const signalsAreIndependent = requestSignal !== callerController.signal;
    expect(signalsAreIndependent).toBe(true);

    callerController.abort();

    expect(requestSignal.aborted).toBe(true);
  });

  it('leaves an internal request signal active when the caller signal is already aborted', async () => {
    const callerController = new AbortController();
    callerController.abort();
    await request('/projects', { signal: callerController.signal });

    const requestSignal = capturedRequestConfig().signal;
    const requestSignalRemainsActive = requestSignal.aborted === false;
    expect(requestSignalRemainsActive).toBe(true);
  });

  it('cancels each request independently', async () => {
    const firstCallerController = new AbortController();
    const secondCallerController = new AbortController();
    await request('/projects/first', { signal: firstCallerController.signal });
    await request('/projects/second', { signal: secondCallerController.signal });

    const firstRequestSignal = capturedRequestConfig(0).signal;
    const secondRequestSignal = capturedRequestConfig(1).signal;
    const requestSignalsAreIndependent = firstRequestSignal !== secondRequestSignal;
    expect(requestSignalsAreIndependent).toBe(true);

    firstCallerController.abort();

    expect(firstRequestSignal.aborted).toBe(true);
    expect(secondRequestSignal.aborted).toBe(false);

    secondCallerController.abort();

    expect(secondRequestSignal.aborted).toBe(true);
  });

  it.each(['/login', '/login/', '/login///', '/prefix/login///'])(
    'does not probe the session on login route %s',
    async (pathname) => {
      location.pathname = pathname;
      const error = { response: { status: 401 }, config: { url: '/projects' } };
      await rejectResponse(error);

      expect(axiosState.get).not.toHaveBeenCalled();
      expect(location.replace).not.toHaveBeenCalled();
    },
  );

  it.each(['/plugins/github/test', '/plugins/github/connections/9/test/'])(
    'does not probe the session for plugin connection test %s',
    async (url) => {
      const error = { response: { status: 401 }, config: { url } };
      await rejectResponse(error);

      expect(axiosState.get).not.toHaveBeenCalled();
      expect(location.replace).not.toHaveBeenCalled();
    },
  );

  it('does not treat a non-string request URL as a plugin test route', async () => {
    const error = { response: { status: 401 }, config: { url: {} } };
    await rejectResponse(error);
    await settleSessionCheck();

    expect(axiosState.get).toHaveBeenCalledExactlyOnceWith('/auth/userinfo');
    expect(location.replace).not.toHaveBeenCalled();
  });

  it('redirects only after the session endpoint confirms an unauthenticated user', async () => {
    axiosState.get.mockResolvedValueOnce({ data: { authenticated: false } });
    const error = { response: { status: 401 }, config: { url: '/projects' } };
    await rejectResponse(error);
    await settleSessionCheck();

    expect(axiosState.get).toHaveBeenCalledExactlyOnceWith('/auth/userinfo');
    expect(location.replace).toHaveBeenCalledExactlyOnceWith(
      `${PATHS.LOGIN()}?return_url=${encodeURIComponent('/projects?keep=1')}`,
    );
  });

  it.each([{ data: { authenticated: true } }, { data: {} }])(
    'does not redirect when the session endpoint does not confirm logout',
    async (response) => {
      axiosState.get.mockResolvedValueOnce(response);
      const error = { response: { status: 401 }, config: { url: '/projects' } };
      await rejectResponse(error);
      await settleSessionCheck();

      expect(location.replace).not.toHaveBeenCalled();
    },
  );

  it('does not redirect when session confirmation fails', async () => {
    axiosState.get.mockRejectedValueOnce(new Error('safe failure'));
    const error = { response: { status: 401 }, config: { url: '/projects' } };
    await rejectResponse(error);
    await settleSessionCheck();

    expect(location.replace).not.toHaveBeenCalled();
  });

  it('keeps the migration redirect for status 428', async () => {
    const error = { response: { status: 428 }, config: { url: '/projects' } };
    await rejectResponse(error);

    expect(location.replace).toHaveBeenCalledExactlyOnceWith(PATHS.DB_MIGRATE());
    expect(axiosState.get).not.toHaveBeenCalled();
  });
});
