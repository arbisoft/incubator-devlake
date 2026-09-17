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

import { useState } from 'react';
import { Button, Descriptions, Flex, message, Modal, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import API from '@/api';
import { OTEL_INGESTION_STATE, type OtelIngestionStatus, type OtelMetricBatchSummary } from '@/api/otel';
import { formatTime } from '@/utils';

const stateColor = {
  [OTEL_INGESTION_STATE.HEALTHY]: 'green',
  [OTEL_INGESTION_STATE.DEGRADED]: 'orange',
  [OTEL_INGESTION_STATE.UNHEALTHY]: 'red',
} as const;

const formatAge = (seconds?: number) => {
  if (seconds === undefined) return 'None';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m`;
};

const converterState = (status: OtelIngestionStatus) => {
  if (!status.converterLease) return 'Unavailable';
  return status.converterLease.active ? 'Active' : 'Lease expired';
};

type OtelIngestionHealthProps = {
  loading: boolean;
  status?: OtelIngestionStatus;
};

export const OtelIngestionHealth = ({ loading, status }: OtelIngestionHealthProps) => {
  const [payload, setPayload] = useState<unknown>();
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [payloadOpen, setPayloadOpen] = useState(false);
  const payloadText = payloadLoading ? 'Loading...' : JSON.stringify(payload, null, 2) ?? '';

  const viewPayload = async (batch: OtelMetricBatchSummary) => {
    setPayloadLoading(true);
    setPayloadOpen(true);
    try {
      setPayload(await API.otel.metricBatchPayload(batch.id));
    } catch {
      setPayloadOpen(false);
      message.error('Unable to load the telemetry payload.');
    } finally {
      setPayloadLoading(false);
    }
  };

  const columns: ColumnsType<OtelMetricBatchSummary> = [
    { title: 'Received', dataIndex: 'receivedAt', render: (value) => formatTime(value) },
    { title: 'Status', dataIndex: 'status', render: (value) => <Tag>{value}</Tag> },
    { title: 'Datapoints', dataIndex: 'datapointCount', align: 'right' },
    {
      title: '',
      width: 120,
      render: (_, batch) => (
        <Button size="small" onClick={() => viewPayload(batch)}>
          View payload
        </Button>
      ),
    },
  ];

  return (
    <Flex vertical gap={12} style={{ marginBottom: 16 }}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={5} style={{ margin: 0 }}>
          Telemetry ingestion
        </Typography.Title>
        {status && <Tag color={stateColor[status.state]}>{status.state}</Tag>}
      </Flex>
      {status ? (
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 4 }}>
          <Descriptions.Item label="Pending">{status.batchCounts.pending ?? 0}</Descriptions.Item>
          <Descriptions.Item label="Retrying">{status.batchCounts.retryable_error ?? 0}</Descriptions.Item>
          <Descriptions.Item label="Oldest backlog">
            {formatAge(status.oldestNonterminal?.ageSeconds)}
          </Descriptions.Item>
          <Descriptions.Item label="Permanent errors (24h)">{status.recentPermanentErrors}</Descriptions.Item>
          <Descriptions.Item label="Converter">{converterState(status)}</Descriptions.Item>
        </Descriptions>
      ) : (
        <Typography.Text type="secondary">
          {loading ? 'Loading ingestion status...' : 'Ingestion status is unavailable.'}
        </Typography.Text>
      )}
      {status?.reasons.length ? <Typography.Text type="warning">{status.reasons.join('; ')}</Typography.Text> : null}
      <Table<OtelMetricBatchSummary>
        size="small"
        rowKey="id"
        pagination={{
          defaultPageSize: 10,
          pageSizeOptions: [10, 20, 50, 100],
          showSizeChanger: true,
        }}
        loading={loading}
        dataSource={status?.recentBatches ?? []}
        columns={columns}
      />
      <Modal
        title="OTLP payload"
        open={payloadOpen}
        footer={null}
        width={900}
        onCancel={() => {
          setPayloadOpen(false);
          setPayload(undefined);
        }}
      >
        <Typography.Paragraph copyable={{ text: payloadText }}>
          <pre style={{ maxHeight: 520, overflow: 'auto', margin: 0 }}>{payloadText}</pre>
        </Typography.Paragraph>
      </Modal>
    </Flex>
  );
};
