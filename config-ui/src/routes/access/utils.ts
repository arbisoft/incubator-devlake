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

import axios, { HttpStatusCode } from 'axios';

const ACCESS_ERROR = {
  DUPLICATE_DOMAIN: 'This domain already has a DevLake access policy.',
  DUPLICATE_USER: 'This email already has a DevLake access entry.',
  INVALID_DOMAIN: 'Enter a valid email domain and role, then try again.',
  INVALID_USER: 'Enter a valid email and role, then try again.',
  REQUEST_FAILED: 'Unable to update access settings. Please try again.',
} as const;

export const normalizeDomain = (value: string) => value.trim().toLowerCase();

export const isValidDomain = (value: string) => {
  const domain = normalizeDomain(value);
  return (
    domain.length > 0 &&
    !/[\s@]/.test(domain) &&
    !domain.startsWith('.') &&
    !domain.endsWith('.') &&
    !domain.includes('..')
  );
};

export const isValidEmail = (value: string) => {
  const email = value.trim();
  const at = email.indexOf('@');
  return at > 0 && at === email.lastIndexOf('@') && isValidDomain(email.slice(at + 1)) && !/\s/.test(email);
};

const serverMessage = (error: unknown) => {
  if (!axios.isAxiosError<{ message?: unknown }>(error) || error.response?.status !== HttpStatusCode.BadRequest) {
    return '';
  }
  return typeof error.response.data?.message === 'string' ? error.response.data.message : '';
};

export const getCreateUserError = (error: unknown) => {
  const message = serverMessage(error);
  if (message.includes('this email already has a DevLake access entry')) return ACCESS_ERROR.DUPLICATE_USER;
  return message ? ACCESS_ERROR.INVALID_USER : ACCESS_ERROR.REQUEST_FAILED;
};

export const getCreateDomainError = (error: unknown) => {
  const message = serverMessage(error);
  if (message.includes('this domain already has a DevLake access policy')) return ACCESS_ERROR.DUPLICATE_DOMAIN;
  return message ? ACCESS_ERROR.INVALID_DOMAIN : ACCESS_ERROR.REQUEST_FAILED;
};
