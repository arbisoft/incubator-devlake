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
import { OTEL_INGESTION_STATE } from '@/api/otel';
import { useRefreshData } from '@/hooks';
import {
  CODE_LANGUAGE,
  CodeBlock,
  DEFAULT_PAGE,
  DataTable,
  DetailDrawer,
  EMPTY_STATE_SIZE,
  KeyValueList,
  SectionCard,
  STATUS_BADGE_VARIANT,
  StatusBadge,
} from '@/ui';

import { BATCH_PAGE_SIZE_OPTIONS, COPY, DEFAULT_BATCH_PAGE_SIZE } from './constants';
import { getBatchColumns } from './ingestion-columns';
import { Hint, Stack } from './styled';
import { INGESTION_STATE_TONE } from './tones';
import type { OtelIngestionHealthProps } from './types';
import { formatAge, getConverterLabel } from './utils';

export const OtelIngestionHealth = ({ loading, failed, status, onRetry }: OtelIngestionHealthProps) => {
  const [batchId, setBatchId] = useState<ID>();
  const [payloadVersion, setPayloadVersion] = useState(0);
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_BATCH_PAGE_SIZE);
  const payload = useRefreshData(
    (signal) => (batchId === undefined ? Promise.resolve(undefined) : API.otel.metricBatchPayload(batchId, signal)),
    [batchId, payloadVersion],
  );

  const batches = useMemo(() => status?.recentBatches ?? [], [status]);
  const rows = useMemo(() => batches.slice((page - 1) * pageSize, page * pageSize), [batches, page, pageSize]);
  const columns = useMemo(() => getBatchColumns((batch) => setBatchId(batch.id)), []);

  const metrics = status && [
    { label: COPY.health.metrics.pending, value: status.batchCounts.pending ?? 0 },
    { label: COPY.health.metrics.retrying, value: status.batchCounts.retryable_error ?? 0 },
    { label: COPY.health.metrics.oldestBacklog, value: formatAge(status.oldestNonterminal?.ageSeconds) },
    { label: COPY.health.metrics.permanentErrors, value: status.recentPermanentErrors },
    { label: COPY.health.metrics.converter, value: getConverterLabel(status) },
  ];
  const healthContent = () => {
    if (metrics) return <KeyValueList items={metrics} />;
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
    <>
      <SectionCard
        title={COPY.health.title}
        actions={
          status && (
            <StatusBadge
              tone={INGESTION_STATE_TONE[status.state]}
              label={COPY.health.state[status.state]}
              variant={STATUS_BADGE_VARIANT.DOT}
            />
          )
        }
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
          loading={loading}
          columns={columns}
          dataSource={rows}
          empty={{ ...COPY.health.emptyBatches, size: EMPTY_STATE_SIZE.SECTION }}
          pagination={{
            page,
            pageSize,
            total: batches.length,
            pageSizeOptions: BATCH_PAGE_SIZE_OPTIONS,
            onPageChange: setPage,
            onPageSizeChange: (size) => {
              setPageSize(size);
              setPage(DEFAULT_PAGE);
            },
          }}
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
