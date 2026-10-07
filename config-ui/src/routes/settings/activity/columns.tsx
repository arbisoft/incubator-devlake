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

import type { TableColumnsType } from 'antd';

import type { AccessAuditEvent } from '@/api/access';
import { COMMON_COPY } from '@/ui';

import { COPY } from '../constants';

export const getAuditColumns = (): TableColumnsType<AccessAuditEvent> => [
  { title: COPY.activity.columns.when, dataIndex: 'createdAt', key: 'createdAt' },
  { title: COPY.activity.columns.action, dataIndex: 'action', key: 'action' },
  {
    title: COPY.activity.columns.actor,
    dataIndex: 'actorEmail',
    key: 'actorEmail',
    render: (value: string) => value || COPY.activity.system,
  },
  {
    title: COPY.activity.columns.target,
    dataIndex: 'targetEmail',
    key: 'targetEmail',
    render: (value: string) => value || COMMON_COPY.emptyValue,
  },
  { title: COPY.activity.columns.detail, dataIndex: 'detail', key: 'detail' },
];
