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

import { waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders, isAxiosError, type InternalAxiosRequestConfig } from 'axios';
import { expect, vi } from 'vitest';

export const makePasswordError = (
  password: string,
  status: number,
  code: string,
  extraData: Record<string, unknown> = {},
): AxiosError => {
  const config = {
    headers: new AxiosHeaders(),
    data: JSON.stringify({ password }),
  } as InternalAxiosRequestConfig;
  const error = new AxiosError('Request failed', 'ERR_BAD_REQUEST', config);
  error.response = {
    status,
    statusText: 'Request failed',
    headers: new AxiosHeaders(),
    config,
    data: { code, ...extraData },
  };
  return error;
};

export const captureLoggedRequestBody = () => {
  let loggedRequestBody = false;
  vi.spyOn(console, 'error').mockImplementation((_message, source) => {
    loggedRequestBody = Boolean(isAxiosError(source) && source.config?.data);
  });
  return () => loggedRequestBody;
};

export const expectPasswordErrorSafe = (
  error: AxiosError,
  loggedBodyReader: () => boolean,
  input: HTMLInputElement,
  expectedPassword: string,
) => {
  expect(loggedBodyReader()).toBeFalsy();
  expect(error.config?.data === undefined).toBeTruthy();
  expect(input.value === expectedPassword).toBeTruthy();
};

export const waitForPasswordFormReady = async (button: HTMLElement) => {
  await waitFor(() => expect(button.classList.contains('ant-btn-loading')).toBeFalsy(), {
    onTimeout: () => new Error('The password form was not ready to retry.'),
  });
};
