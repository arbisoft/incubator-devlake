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

import { HistoryOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useMemo, useState } from 'react';

import API from '@/api';
import { useAutoRefresh } from '@/hooks';
import { DataTable, EMPTY_STATE_SIZE, SectionCard, buildListEmpty, useRefreshVersion } from '@/ui';

import { ReplayModal } from './components';
import { OTEL_POLL } from './constants';
import { getReplayColumns } from './replay-columns';
import { REPLAY_COPY } from './replay-constants';
import type { OtelReplaysProps } from './types';
import { usePageState } from './use-page-state';

export const OtelReplays = ({ version }: OtelReplaysProps) => {
  const { page, pageSize, paginationFor } = usePageState();
  const { version: localVersion, refresh } = useRefreshVersion();
  const [open, setOpen] = useState(false);
  const { data, error } = useAutoRefresh(
    (signal) => API.otel.listReplays({ page, pageSize }, signal),
    [version, localVersion, page, pageSize],
    OTEL_POLL,
  );
  const columns = useMemo(() => getReplayColumns(), []);
  const failed = data === undefined && error !== undefined;
  const empty = buildListEmpty({
    failed,
    onRetry: refresh,
    filtered: false,
    empty: REPLAY_COPY.empty,
    noResults: REPLAY_COPY.empty,
  });

  return (
    <>
      <SectionCard
        title={REPLAY_COPY.title}
        description={REPLAY_COPY.description}
        count={data?.count}
        actions={
          <Button icon={<HistoryOutlined aria-hidden />} onClick={() => setOpen(true)}>
            {REPLAY_COPY.rebuild}
          </Button>
        }
      >
        <DataTable
          rowKey="id"
          ariaLabel={REPLAY_COPY.tableLabel}
          loading={data === undefined && error === undefined}
          columns={columns}
          dataSource={data?.replays ?? []}
          pagination={paginationFor(data?.count ?? 0)}
          empty={{ ...empty, ...(failed && { title: REPLAY_COPY.unavailable }), size: EMPTY_STATE_SIZE.SECTION }}
        />
      </SectionCard>
      <ReplayModal open={open} onClose={() => setOpen(false)} onQueued={refresh} />
    </>
  );
};
