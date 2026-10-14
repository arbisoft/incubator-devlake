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

import axios, { type AxiosRequestConfig } from 'axios';

import { DEVLAKE_ENDPOINT, PATHS } from '@/config';

import {
  ACCESS_TOKEN_STORAGE_KEY,
  AUTHORIZATION_HEADER,
  AUTH_USERINFO_PATH,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  DEFAULT_REQUEST_METHOD,
  GET_METHODS,
  HTTP_STATUS,
  LOGIN_ROUTE_SUFFIX,
  PATH_SEPARATOR,
  PLUGIN_CONNECTION_TEST_ROUTE,
} from './request.constants';
import type { RequestConfig, SessionStatus } from './request.types';

export type { RequestConfig } from './request.types';

const instance = axios.create({
  baseURL: DEVLAKE_ENDPOINT,
  withCredentials: true,
  // Axios echoes the CSRF cookie as a header on unsafe methods.
  xsrfCookieName: CSRF_COOKIE_NAME,
  xsrfHeaderName: CSRF_HEADER_NAME,
});

const isLoginRoute = () => {
  let { pathname } = window.location;
  while (pathname.endsWith(PATH_SEPARATOR)) {
    pathname = pathname.slice(0, -PATH_SEPARATOR.length);
  }
  return pathname.endsWith(LOGIN_ROUTE_SUFFIX);
};

let verifyingSession = false;

// Confirm 401 responses against session status before redirecting on endpoint-specific failures.
const redirectToLoginIfSessionIsReallyGone = async () => {
  if (verifyingSession || isLoginRoute()) {
    return;
  }
  verifyingSession = true;
  try {
    const status = await instance.get<SessionStatus>(AUTH_USERINFO_PATH).then((res) => res.data);
    if (status?.authenticated !== false) {
      return;
    }
  } catch {
    // Could not confirm either way; do not redirect on ambiguous evidence.
    return;
  } finally {
    verifyingSession = false;
  }
  const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.replace(`${PATHS.LOGIN()}?return_url=${returnUrl}`);
};

const isPluginConnectionTest = (url?: string) => !!url && PLUGIN_CONNECTION_TEST_ROUTE.test(url);

instance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const requestUrl = typeof error.config?.url === 'string' ? error.config.url : undefined;

    if (status === HTTP_STATUS.PRECONDITION_REQUIRED) {
      window.location.replace(PATHS.DB_MIGRATE());
    }

    if (status === HTTP_STATUS.UNAUTHORIZED && !isLoginRoute() && !isPluginConnectionTest(requestUrl)) {
      void redirectToLoginIfSessionIsReallyGone();
    }

    return Promise.reject(error);
  },
);

export const request = (path: string, config?: RequestConfig) => {
  const { method = DEFAULT_REQUEST_METHOD, data, timeout, headers, signal } = config || {};

  const controller = new AbortController();
  const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  const h = { ...headers };
  if (token) {
    h[AUTHORIZATION_HEADER] = `Bearer ${token}`;
  }

  const params: AxiosRequestConfig = {
    baseURL: config?.baseURL,
    url: path,
    method,
    timeout,
    headers: h,
    signal: controller.signal,
    responseType: config?.responseType,
  };

  if (GET_METHODS.includes(method)) {
    params.params = data;
  } else {
    params.data = data;
  }

  const promise = instance.request(params).then((resp) => resp.data);

  if (signal) {
    signal.addEventListener('abort', () => {
      controller.abort();
    });
  }

  return promise;
};
