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

import { useNavigate } from 'react-router-dom';
import { Button, Card, Space, Table, Typography } from 'antd';

import API from '@/api';
import { type OtelConnectionResponse } from '@/api/otel';
import { PATHS } from '@/config';
import { useRefreshData } from '@/hooks';

import ClaudeCodeOtelIcon from '@/plugins/register/claude_otel/assets/icon.svg?react';

import { getClaudeCodeOtelProjectColumns } from './claude-code-otel-columns';

type ClaudeCodeOtelPanelProps = {
  projectName: string;
};

export const ClaudeCodeOtelPanel = ({ projectName }: ClaudeCodeOtelPanelProps) => {
  const navigate = useNavigate();
  const { data, ready } = useRefreshData(() => API.otel.listForProject(projectName), [projectName]);
  const connections = data ?? [];

  return (
    <Card
      title={
        <Space>
          <ClaudeCodeOtelIcon width={20} height={20} />
          <span>Claude Code OTel</span>
        </Space>
      }
      extra={
        <Button
          type="primary"
          onClick={() => navigate(`${PATHS.OTEL()}?project=${encodeURIComponent(projectName)}&create=true`)}
        >
          Add Claude Code OTel
        </Button>
      }
    >
      <Table<OtelConnectionResponse>
        rowKey={(record) => record.connection.id}
        size="small"
        loading={!ready}
        pagination={false}
        dataSource={connections}
        locale={{ emptyText: 'No Claude Code OTel connections are linked to this project.' }}
        columns={getClaudeCodeOtelProjectColumns(navigate)}
      />
      <Typography.Text type="secondary">
        This project shows telemetry configured for its linked teams. Shared teams appear in every linked project and do
        not represent repository-level attribution.
      </Typography.Text>
    </Card>
  );
};
