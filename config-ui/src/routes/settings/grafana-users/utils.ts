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

import type { AccessUser } from '@/api/access';
import { ACCESS_STATUS, type AccessStatus } from '@/api/access/constants';
import { GRAFANA_ERROR_CODE } from '@/api/grafana-users/constants';
import type {
  GrafanaCreateUserBody,
  GrafanaPatchUserBody,
  GrafanaUser,
  GrafanaUserListParams,
} from '@/api/grafana-users/types';
import { toUserMessage } from '@/ui/utils';

import { isValidEmail, toAccessPagination } from '../utils';

import {
  GENERATED_PASSWORD_LENGTH,
  GRAFANA_ERROR_MAP,
  GRAFANA_MENU_ACTION,
  PASSWORD_ALPHABET,
  PASSWORD_MIN_LENGTH,
} from './constants';
import type { DevlakeUserOption, GrafanaMenuAction, ProjectOption } from './types';

export const toGrafanaListParams = ({
  page,
  pageSize,
  keyword,
}: {
  page: number;
  pageSize: number;
  keyword?: string;
}): GrafanaUserListParams => ({ ...toAccessPagination({ page, pageSize }), query: keyword || undefined });

export const toUserStatus = (user: GrafanaUser): AccessStatus =>
  user.disabled ? ACCESS_STATUS.DISABLED : ACCESS_STATUS.ACTIVE;

export const getUserIdentity = ({ name, email }: GrafanaUser) =>
  name ? { primary: name, secondary: email } : { primary: email, secondary: undefined };

export const getUnavailableMessage = (source: unknown) =>
  toUserMessage(source, GRAFANA_ERROR_MAP, GRAFANA_ERROR_MAP[GRAFANA_ERROR_CODE.UNAVAILABLE]);

export const getFlowError = (map: Record<string, string>) => (error: unknown) => toUserMessage(error, map);

const UINT32_RANGE = 2 ** 32;

// Rejection sampling keeps every character equally likely.
export const generatePassword = (length = GENERATED_PASSWORD_LENGTH, alphabet = PASSWORD_ALPHABET) => {
  const limit = UINT32_RANGE - (UINT32_RANGE % alphabet.length);
  let password = '';
  while (password.length < length) {
    const draw = crypto.getRandomValues(new Uint32Array(length));
    for (const value of draw) {
      if (value < limit && password.length < length) password += alphabet[value % alphabet.length];
    }
  }
  return password;
};

export const isValidPassword = (password: string) => password.length >= PASSWORD_MIN_LENGTH;

export const isValidNewUser = ({ email, name, password }: { email: string; name: string; password: string }) =>
  isValidEmail(email) && name.trim() !== '' && isValidPassword(password);

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const getUserDisplayName = ({ name, email }: GrafanaUser) => name || email;

export const buildDetailsPatch = (user: GrafanaUser, values: { name: string; email: string }): GrafanaPatchUserBody => {
  const name = values.name.trim();
  const email = normalizeEmail(values.email);
  return { name: name === user.name ? undefined : name, email: email === user.email ? undefined : email };
};

export const hasPatchChanges = (patch: GrafanaPatchUserBody) =>
  Object.values(patch).some((value) => value !== undefined);

export const buildCreateBody = (values: {
  email: string;
  name: string;
  password: string;
  role: GrafanaCreateUserBody['role'];
  projects: string[];
}): GrafanaCreateUserBody => ({
  email: normalizeEmail(values.email),
  name: values.name.trim(),
  role: values.role,
  projectNames: values.projects,
  password: values.password,
});

export const buildProjectOptions = (selected: string[], found: string[]): ProjectOption[] =>
  [...new Set([...selected, ...found])].map((name) => ({ value: name, label: name }));

export const toDevlakeUserOption = ({ id, email, displayName }: AccessUser): DevlakeUserOption => ({
  value: id,
  label: displayName && email ? `${displayName} (${email})` : displayName || email || '',
  email: email ?? '',
  name: displayName,
});

export const getPartialUserId = (error: unknown): ID | undefined => {
  const response =
    typeof error === 'object' && error !== null ? (error as { response?: { data?: unknown } }).response : undefined;
  const data = response?.data;
  if (typeof data !== 'object' || data === null) return undefined;
  const { code, userId } = data as { code?: unknown; userId?: unknown };
  return code === GRAFANA_ERROR_CODE.PARTIAL && (typeof userId === 'number' || typeof userId === 'string')
    ? userId
    : undefined;
};

export const getMenuActions = (user: GrafanaUser): GrafanaMenuAction[] => {
  if (user.protected) return [];
  return user.sso ? [GRAFANA_MENU_ACTION.DETAILS] : [GRAFANA_MENU_ACTION.DETAILS, GRAFANA_MENU_ACTION.PASSWORD];
};
