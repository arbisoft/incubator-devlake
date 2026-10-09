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

import { PipelineProgress } from '@/ui';

import { PIPELINE_PROGRESS_STATUS_MAP } from '../status-tone';

import { PipelineStatusBadge } from './status-badge';
import { StatusStack } from './styled';
import type { PipelineStatusCellProps } from './types';

export const PipelineStatusCell = ({ status, finished, total }: PipelineStatusCellProps) => (
  <StatusStack>
    <PipelineStatusBadge status={status} />
    <PipelineProgress status={PIPELINE_PROGRESS_STATUS_MAP[status]} finished={finished} total={total} />
  </StatusStack>
);
