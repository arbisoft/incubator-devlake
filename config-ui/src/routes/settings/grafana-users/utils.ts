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

import { ACCESS_STATUS, type AccessStatus } from '@/api/access/constants';
import { GRAFANA_ERROR_CODE } from '@/api/grafana-users/constants';
import type { GrafanaUser, GrafanaUserListParams } from '@/api/grafana-users/types';
import { toUserMessage } from '@/ui/utils';

import { toAccessPagination } from '../utils';

import { GRAFANA_ERROR_MAP } from './constants';

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
