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

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { IPipelineStatus } from '@/types';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import { STATUS_TONE } from '@/ui/constants';
import { PIPELINE_PROGRESS_STATUS } from '@/ui/pipeline-progress/constants';

import { PIPELINE_PROGRESS_STATUS_MAP, PIPELINE_STATUS_COPY, PIPELINE_STATUS_TONE } from '../status-tone';

import { PipelineStatusBadge } from './status-badge';

const ALL_STATUSES = Object.values(IPipelineStatus);

describe('pipeline status maps', () => {
  it('give every status a tone and a label', () => {
    for (const status of ALL_STATUSES) {
      expect(PIPELINE_STATUS_TONE[status]).toBeTruthy();
      expect(PIPELINE_STATUS_COPY[status]).toBeTruthy();
    }
  });

  it.each([
    [IPipelineStatus.COMPLETED, STATUS_TONE.SUCCESS],
    [IPipelineStatus.PARTIAL, STATUS_TONE.SUCCESS],
    [IPipelineStatus.FAILED, STATUS_TONE.ERROR],
    [IPipelineStatus.RUNNING, STATUS_TONE.INFO],
    [IPipelineStatus.PENDING, STATUS_TONE.NEUTRAL],
    [IPipelineStatus.CANCELLED, STATUS_TONE.NEUTRAL],
  ])('maps %s to the %s tone', (status, tone) => {
    expect(PIPELINE_STATUS_TONE[status]).toBe(tone);
  });
});

describe('pipeline progress status map', () => {
  it('covers every status', () => {
    for (const status of ALL_STATUSES) {
      expect(PIPELINE_PROGRESS_STATUS_MAP[status]).toBeTruthy();
    }
  });

  it.each([
    [IPipelineStatus.CREATED, PIPELINE_PROGRESS_STATUS.PENDING],
    [IPipelineStatus.RERUN, PIPELINE_PROGRESS_STATUS.RUNNING],
    [IPipelineStatus.PARTIAL, PIPELINE_PROGRESS_STATUS.COMPLETED],
    [IPipelineStatus.FAILED, PIPELINE_PROGRESS_STATUS.FAILED],
    [IPipelineStatus.CANCELLED, PIPELINE_PROGRESS_STATUS.PENDING],
  ])('maps %s to the %s bar', (status, bar) => {
    expect(PIPELINE_PROGRESS_STATUS_MAP[status]).toBe(bar);
  });
});

describe('PipelineStatusBadge', () => {
  it('shows the status as text', () => {
    renderWithTheme(<PipelineStatusBadge status={IPipelineStatus.FAILED} />);
    expect(screen.getByText(PIPELINE_STATUS_COPY[IPipelineStatus.FAILED])).toBeTruthy();
  });
});
