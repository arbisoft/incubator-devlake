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

import type { AccessDomain, AccessRole, AccessStatus, AccessUser } from '@/api/access';

import type { StatusColumnFilter } from '../columns.types';

export type UserColumnActions = {
  onRoleChange: (user: AccessUser, role: AccessRole) => void;
  onStatusChange: (user: AccessUser, status: AccessStatus) => void;
  onRemove: (user: AccessUser) => void;
  onAddLocalCredential: (user: AccessUser) => void;
  onResetLocalCredential: (user: AccessUser) => void;
  onRemoveLocalCredential: (user: AccessUser) => void;
  localAuthEnabled: boolean;
  statusFilter: StatusColumnFilter;
};

export type DomainColumnActions = {
  onRoleChange: (domain: AccessDomain, role: AccessRole) => void;
  onStatusChange: (domain: AccessDomain, status: AccessStatus) => void;
  onRemove: (domain: AccessDomain) => void;
};
