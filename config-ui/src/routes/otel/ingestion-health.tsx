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

import { Alert, Button, Skeleton } from 'antd';
import { useMemo, useState } from 'react';

import API from '@/api';
import { OTEL_BATCH_STATUS, OTEL_INGESTION_STATE } from '@/api/otel';
import { useRefreshData } from '@/hooks';
import {
  CODE_LANGUAGE,
  CodeBlock,
  DataTable,
  DetailDrawer,
  EMPTY_STATE_SIZE,
  MetricTile,
  SectionCard,
  STATUS_BADGE_VARIANT,
  StatusBadge,
  buildListEmpty,
} from '@/ui';

import { COPY } from './constants';
import { getBatchColumns } from './ingestion-columns';
import { Hint, MetricGrid, Stack } from './styled';
import { INGESTION_STATE_TONE } from './tones';
import type { OtelIngestionHealthProps } from './types';
import { useClientPagination } from './use-client-pagination';
import { formatAge, getBacklogTone, getConverterLabel, getPermanentErrorTone } from './utils';

export const OtelIngestionHealth = ({ loading, failed, status, onRetry }: OtelIngestionHealthProps) => {
  const [batchId, setBatchId] = useState<ID>();
  const [payloadVersion, setPayloadVersion] = useState(0);
  const payload = useRefreshData(
    (signal) => (batchId === undefined ? Promise.resolve(undefined) : API.otel.metricBatchPayload(batchId, signal)),
    [batchId, payloadVersion],
  );

  const batches = useMemo(() => status?.recentBatches ?? [], [status]);
  const { rows, pagination } = useClientPagination(batches);
  const columns = useMemo(() => getBatchColumns((batch) => setBatchId(batch.id)), []);
  const failedBeforeStatus = failed && !status;
  const batchesEmpty = buildListEmpty({
    failed: failedBeforeStatus,
    onRetry,
    filtered: false,
    empty: COPY.health.emptyBatches,
    noResults: COPY.health.emptyBatches,
  });
  const batchEmpty = failedBeforeStatus ? { ...batchesEmpty, title: COPY.health.batchesUnavailable } : batchesEmpty;

  const metrics = status && [
    { label: COPY.health.metrics.pending, value: status.batchCounts[OTEL_BATCH_STATUS.PENDING] ?? 0 },
    { label: COPY.health.metrics.retrying, value: status.batchCounts[OTEL_BATCH_STATUS.RETRYABLE_ERROR] ?? 0 },
    {
      label: COPY.health.metrics.oldestBacklog,
      value: formatAge(status.oldestNonterminal?.ageSeconds),
      tone: getBacklogTone(status.oldestNonterminal?.ageSeconds),
    },
    {
      label: COPY.health.metrics.permanentErrors,
      value: status.recentPermanentErrors,
      tone: getPermanentErrorTone(status.recentPermanentErrors),
    },
    { label: COPY.health.metrics.converter, value: getConverterLabel(status) },
  ];
  const healthContent = () => {
    if (metrics) {
      return (
        <MetricGrid>
          {metrics.map((metric) => (
            <MetricTile key={metric.label} bordered {...metric} />
          ))}
        </MetricGrid>
      );
    }
    if (failed) {
      return (
        <Alert
          type="error"
          showIcon
          title={COPY.health.unavailable}
          action={<Button onClick={onRetry}>{COPY.health.retry}</Button>}
        />
      );
    }
    if (loading) return <Hint>{COPY.health.loading}</Hint>;
    return <Hint>{COPY.health.unavailable}</Hint>;
  };

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
          {status.logs && (
            <>
              <Descriptions.Item label="Log events pending">{status.logs.batchCounts.pending ?? 0}</Descriptions.Item>
              <Descriptions.Item label="Log events retrying">
                {status.logs.batchCounts.retryable_error ?? 0}
              </Descriptions.Item>
              <Descriptions.Item label="Log events replaying">
                {status.logs.batchCounts.replay_pending ?? 0}
              </Descriptions.Item>
              <Descriptions.Item label="Oldest log backlog">
                {formatAge(status.logs.oldestNonterminal?.ageSeconds)}
              </Descriptions.Item>
              <Descriptions.Item label="Log permanent errors (24h)">
                {status.logs.recentPermanentErrors}
              </Descriptions.Item>
            </>
          )}
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
        <Stack>
          {healthContent()}
          {status && status.reasons.length > 0 && (
            <Alert
              type={status.state === OTEL_INGESTION_STATE.UNHEALTHY ? 'error' : 'warning'}
              showIcon
              title={status.reasons.join('; ')}
            />
          )}
        </Stack>
      </SectionCard>
      <SectionCard title={COPY.health.batchesTitle} count={status ? batches.length : undefined}>
        <DataTable
          rowKey="id"
          ariaLabel={COPY.health.tableLabel}
          loading={loading && !failed}
          columns={columns}
          dataSource={rows}
          empty={{ ...batchEmpty, size: EMPTY_STATE_SIZE.SECTION }}
          pagination={pagination}
        />
      </SectionCard>
      <DetailDrawer open={batchId !== undefined} title={COPY.health.payloadTitle} onClose={() => setBatchId(undefined)}>
        {payload.error !== undefined && (
          <Alert
            type="error"
            showIcon
            title={COPY.health.payloadError}
            action={<Button onClick={() => setPayloadVersion((version) => version + 1)}>{COPY.health.retry}</Button>}
          />
        )}
        {payload.error === undefined && !payload.ready && <Skeleton active />}
        {payload.ready && (
          <CodeBlock value={payload.data} language={CODE_LANGUAGE.JSON} copyLabel={COPY.health.payloadCopy} />
        )}
      </DetailDrawer>
    </>
  );
};
