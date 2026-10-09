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

import { Alert, Button, type TableColumnsType } from 'antd';
import { useMemo } from 'react';

import type { AiSourcePreference } from '@/api/otel';
import { DataTable, EMPTY_STATE_SIZE, SectionCard } from '@/ui';

import { COPY, POLICY_COLUMN, PREFERRED_SOURCE } from './constants';
import type { OtelSourcePolicyProps } from './types';
import { useClientPagination } from './use-client-pagination';

const COLUMNS: TableColumnsType<AiSourcePreference> = [
  { key: POLICY_COLUMN.WORKSPACE, title: COPY.policy.columns.workspace, dataIndex: 'workspaceKey', ellipsis: true },
  { key: POLICY_COLUMN.FAMILY, title: COPY.policy.columns.family, dataIndex: 'metricFamily' },
  { key: POLICY_COLUMN.SOURCE, title: COPY.policy.columns.source, dataIndex: 'preferredSource' },
];

export const OtelSourcePolicy = ({ loading, failed, preferences, onRetry }: OtelSourcePolicyProps) => {
  const active = useMemo(
    () => (preferences ?? []).filter(({ preferredSource }) => preferredSource === PREFERRED_SOURCE),
    [preferences],
  );
  const { rows, pagination } = useClientPagination(active);

  return (
    <SectionCard title={COPY.policy.title} description={COPY.policy.description}>
      {failed && (
        <Alert
          type="error"
          showIcon
          title={COPY.policy.unavailable}
          action={<Button onClick={onRetry}>{COPY.health.retry}</Button>}
        />
      )}
      <DataTable
        rowKey={({ workspaceKey, metricFamily }) => `${workspaceKey}-${metricFamily}`}
        ariaLabel={COPY.policy.tableLabel}
        loading={loading}
        columns={COLUMNS}
        dataSource={rows}
        pagination={pagination}
        empty={{ ...COPY.policy.empty, size: EMPTY_STATE_SIZE.SECTION }}
      />
    </SectionCard>
  );
};
