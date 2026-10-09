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

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { IPipeline } from '@/types';
import { DataTable, EMPTY_STATE_SIZE } from '@/ui';

import { getPipelineColumns } from '../columns';
import { COPY, PIPELINE_ROW_ACTION } from '../constants';
import type { PipelineSortKey } from '../types';
import { downloadPipelineLogs } from '../use-pipeline-actions';
import { pickConfig } from '../utils';

import { PipelineConfigDrawer } from './config-drawer';
import { PipelineDetailModal } from './detail-modal';
import type { PipelineRowAction, PipelineTableProps } from './types';

const DEFAULT_EMPTY = { ...COPY.empty, size: EMPTY_STATE_SIZE.SECTION };

export const PipelineTable = ({
  loading,
  dataSource,
  pagination,
  list,
  total,
  empty = DEFAULT_EMPTY,
}: PipelineTableProps) => {
  const [configTarget, setConfigTarget] = useState<IPipeline>();
  const [configOpen, setConfigOpen] = useState(false);
  const [detailId, setDetailId] = useState<ID>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!configOpen && !detailOpen) opener?.focus();
  }, [configOpen, detailOpen, opener]);

  const handleRowAction = useCallback(
    async (action: PipelineRowAction, pipeline: IPipeline, trigger: HTMLElement | null) => {
      setOpener(trigger);
      if (action === PIPELINE_ROW_ACTION.CONFIGURATION) {
        setConfigTarget(pipeline);
        setConfigOpen(true);
      } else if (action === PIPELINE_ROW_ACTION.DETAIL) {
        setDetailId(pipeline.id);
        setDetailOpen(true);
      } else {
        await downloadPipelineLogs(pipeline.id);
      }
    },
    [],
  );

  const sortable = list !== undefined;
  const columns = useMemo(
    () => getPipelineColumns({ sortable, onRowAction: handleRowAction }),
    [sortable, handleRowAction],
  );

  return (
    <>
      <DataTable<IPipeline, PipelineSortKey>
        rowKey="id"
        ariaLabel={COPY.tableLabel}
        loading={loading}
        columns={columns}
        dataSource={dataSource}
        empty={empty}
        list={list}
        total={total}
        pagination={pagination}
      />
      {configTarget && (
        <PipelineConfigDrawer
          open={configOpen}
          id={configTarget.id}
          config={pickConfig(configTarget)}
          onClose={() => setConfigOpen(false)}
        />
      )}
      {detailId !== undefined && (
        <PipelineDetailModal
          open={detailOpen}
          id={detailId}
          onClose={() => setDetailOpen(false)}
          afterClose={() => opener?.focus()}
        />
      )}
    </>
  );
};
