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

import { IPipelineStatus } from '@/types';
import { STATUS_TONE } from '@/ui/constants';

export const PIPELINE_STATUS_TONE = {
  [IPipelineStatus.CREATED]: STATUS_TONE.NEUTRAL,
  [IPipelineStatus.PENDING]: STATUS_TONE.NEUTRAL,
  [IPipelineStatus.ACTIVE]: STATUS_TONE.INFO,
  [IPipelineStatus.RUNNING]: STATUS_TONE.INFO,
  [IPipelineStatus.RERUN]: STATUS_TONE.INFO,
  [IPipelineStatus.COMPLETED]: STATUS_TONE.SUCCESS,
  [IPipelineStatus.PARTIAL]: STATUS_TONE.SUCCESS,
  [IPipelineStatus.FAILED]: STATUS_TONE.ERROR,
  [IPipelineStatus.CANCELLED]: STATUS_TONE.NEUTRAL,
} as const;

const PENDING_LABEL = 'Created (Pending)';
const IN_PROGRESS_LABEL = 'In Progress';

export const PIPELINE_STATUS_COPY = {
  [IPipelineStatus.CREATED]: PENDING_LABEL,
  [IPipelineStatus.PENDING]: PENDING_LABEL,
  [IPipelineStatus.ACTIVE]: IN_PROGRESS_LABEL,
  [IPipelineStatus.RUNNING]: IN_PROGRESS_LABEL,
  [IPipelineStatus.RERUN]: IN_PROGRESS_LABEL,
  [IPipelineStatus.COMPLETED]: 'Succeeded',
  [IPipelineStatus.PARTIAL]: 'Partial Success',
  [IPipelineStatus.FAILED]: 'Failed',
  [IPipelineStatus.CANCELLED]: 'Cancelled',
} as const;
