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

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import { COMMON_COPY } from '@/ui/constants';

import { COPY, PIPELINE_PROGRESS_STATUS } from './constants';
import { PipelineProgress } from './pipeline-progress';

describe('PipelineProgress', () => {
  it('shows the bar and the percentage of finished tasks', () => {
    renderWithTheme(<PipelineProgress status={PIPELINE_PROGRESS_STATUS.RUNNING} finished={3} total={12} />);
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: COPY.summary(3, 12) })).toBeTruthy();
  });

  it.each([PIPELINE_PROGRESS_STATUS.COMPLETED, PIPELINE_PROGRESS_STATUS.FAILED, PIPELINE_PROGRESS_STATUS.PENDING])(
    'shows no bar for a %s pipeline without tasks',
    (status) => {
      renderWithTheme(<PipelineProgress status={status} finished={0} total={0} />);
      expect(screen.queryByRole('progressbar')).toBeNull();
      expect(screen.getByLabelText(COPY.noTasks).textContent).toBe(COMMON_COPY.emptyValue);
    },
  );

  it('keeps the bar of a running pipeline that has no total yet', () => {
    renderWithTheme(<PipelineProgress status={PIPELINE_PROGRESS_STATUS.RUNNING} finished={0} total={0} />);
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
  });

  it('caps the percentage at 100', () => {
    renderWithTheme(<PipelineProgress status={PIPELINE_PROGRESS_STATUS.COMPLETED} finished={14} total={12} />);
    expect(screen.getByText('100%')).toBeTruthy();
  });
});
