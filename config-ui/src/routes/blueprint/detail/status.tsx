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

import { PipelinePanel, PipelineTable } from '@/routes/pipeline';
import { EMPTY_STATE_SIZE } from '@/ui';

import { CollapsiblePanel } from './collapsible-panel';
import { COPY } from './constants';
import { useBlueprintPipelines } from './hooks';
import { StatusActions } from './status-actions';
import { EmptyNote, Stack } from './styled';
import type { BlueprintStatusProps } from './types';

const HISTORY_EMPTY = { title: COPY.empty.historical, size: EMPTY_STATE_SIZE.SECTION };

export const BlueprintStatus = ({ context, blueprint, pipelineId, version, onRefresh }: BlueprintStatusProps) => {
  const { pipelines, loading, pagination } = useBlueprintPipelines(blueprint.id, version);

  return (
    <Stack>
      <CollapsiblePanel
        title={COPY.panels.current}
        actions={<StatusActions context={context} blueprint={blueprint} onRefresh={onRefresh} />}
      >
        {pipelineId === undefined ? (
          <EmptyNote>{COPY.empty.current}</EmptyNote>
        ) : (
          <PipelinePanel key={pipelineId} id={pipelineId} />
        )}
      </CollapsiblePanel>
      <CollapsiblePanel title={COPY.panels.historical}>
        <PipelineTable loading={loading} dataSource={pipelines} pagination={pagination} empty={HISTORY_EMPTY} />
      </CollapsiblePanel>
    </Stack>
  );
};
