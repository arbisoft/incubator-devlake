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

import { Table } from 'antd';

import API from '@/api';
import { useRefreshData } from '@/hooks';
import { ListPage, PageHeader } from '@/ui';

import { COPY } from '../constants';

import { getAuditColumns } from './columns';

const AUDIT_COLUMNS = getAuditColumns();

export const SettingsActivity = () => {
  const { data, ready } = useRefreshData(() => API.access.listAuditEvents(), []);

  return (
    <ListPage>
      <PageHeader title={COPY.activity.title} description={COPY.activity.description} />
      <Table
        data-testid="access-activity-table"
        aria-label={COPY.activity.tableLabel}
        rowKey="id"
        size="middle"
        loading={!ready}
        dataSource={data ?? []}
        pagination={false}
        columns={AUDIT_COLUMNS}
      />
    </ListPage>
  );
};
