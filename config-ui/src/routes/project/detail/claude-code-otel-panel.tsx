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

import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import API from '@/api';
import type { OtelConnectionResponse } from '@/api/otel';
import { PATHS } from '@/config';
import { useRefreshData } from '@/hooks';
import { DataTable, SectionCard, buildListEmpty, useRefreshVersion } from '@/ui';

import { getClaudeCodeOtelProjectColumns } from './claude-code-otel-columns';
import { COPY } from './constants';
import { Note } from './styled';
import type { ClaudeCodeOtelPanelProps } from './types';

export const ClaudeCodeOtelPanel = ({ projectName }: ClaudeCodeOtelPanelProps) => {
  const navigate = useNavigate();
  const { version, refresh } = useRefreshVersion();
  const { data, ready, error } = useRefreshData(
    (signal) => API.otel.listForProject(projectName, signal),
    [projectName, version],
  );
  const connections = data ?? [];
  const columns = useMemo(() => getClaudeCodeOtelProjectColumns(() => navigate(PATHS.OTEL())), [navigate]);

  return (
    <SectionCard
      title={COPY.otel.title}
      count={ready ? connections.length : undefined}
      actions={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate(`${PATHS.OTEL()}?project=${encodeURIComponent(projectName)}&create=true`)}
        >
          {COPY.otel.add}
        </Button>
      }
    >
      <DataTable<OtelConnectionResponse>
        rowKey={(record) => record.connection.id}
        ariaLabel={COPY.otel.tableLabel}
        loading={!ready && error === undefined}
        pagination={false}
        dataSource={connections}
        columns={columns}
        empty={buildListEmpty({
          failed: error !== undefined,
          onRetry: refresh,
          filtered: false,
          empty: COPY.otel.empty,
          noResults: COPY.otel.empty,
        })}
      />
      <Note>{COPY.otel.note}</Note>
    </SectionCard>
  );
};
