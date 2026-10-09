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

import { fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import API from '@/api';
import type { ComplianceScorecardRow } from '@/api/compliance-scorecard';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import { COMMON_COPY } from '@/ui/constants';

import { COPY as READINESS_COPY } from '../readiness';

import { COPY } from './constants';
import { ReadinessCard } from './readiness-card';

vi.mock('@/api', () => ({ default: { complianceScorecard: { list: vi.fn() } } }));

const scorecard = vi.mocked(API.complianceScorecard);

const ROW: ComplianceScorecardRow = {
  Project: 'alpha',
  'Issue Visibility': '✅ Jira',
  'PR Visibility': '✅ GitHub, GitLab',
  'AI Visibility': '❌ Not available',
  Compliance: '⚠️ 66.6%',
};

const ARRIVED = 'arrived';

const setup = () =>
  renderWithTheme(
    <MemoryRouter initialEntries={['/start']}>
      <Routes>
        <Route path="/start" element={<ReadinessCard projectName="alpha" />} />
        <Route path="*" element={<p>{ARRIVED}</p>} />
      </Routes>
    </MemoryRouter>,
  );

const rowOf = (name: string) => screen.getByText(name).closest('li') as HTMLElement;

describe('ReadinessCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a skeleton while the report loads', async () => {
    scorecard.list.mockResolvedValue({ count: 1, rows: [ROW] });
    const { container } = setup();
    expect(container.querySelector('.ant-skeleton')).toBeTruthy();
    await screen.findByText('66.6%');
  });

  it('shows an inline error and retries the same query', async () => {
    scorecard.list.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ count: 1, rows: [ROW] });
    setup();
    await screen.findByText(COPY.readiness.loadFailed);
    fireEvent.click(screen.getByRole('button', { name: COMMON_COPY.retry }));
    await screen.findByText('66.6%');
    expect(scorecard.list).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(COPY.readiness.loadFailed)).toBeNull();
  });

  it('shows the empty state when the project is not in the report', async () => {
    scorecard.list.mockResolvedValue({ count: 1, rows: [{ ...ROW, Project: 'other' }] });
    setup();
    await screen.findByText(COPY.readiness.empty.title);
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('lists the three signals with sources and an add-connection target', async () => {
    scorecard.list.mockResolvedValue({ count: 1, rows: [ROW] });
    setup();
    await screen.findByText('66.6%');
    expect(screen.getByText(READINESS_COPY.summary(2, 3))).toBeTruthy();
    expect(within(rowOf(READINESS_COPY.signals.issue.name)).getByText('Jira')).toBeTruthy();
    const pr = within(rowOf(READINESS_COPY.signals.pr.name));
    expect(pr.getByText('GitHub')).toBeTruthy();
    expect(pr.getByText('GitLab')).toBeTruthy();
    const ai = within(rowOf(READINESS_COPY.signals.ai.name));
    expect(ai.getByText(READINESS_COPY.notAvailable)).toBeTruthy();
    expect(screen.getByRole('note').textContent).toBe(COPY.readiness.note);
    fireEvent.click(ai.getByRole('button', { name: READINESS_COPY.addConnection }));
    await screen.findByText(ARRIVED);
  });

  it('offers no add-connection button at 100%', async () => {
    scorecard.list.mockResolvedValue({
      count: 1,
      rows: [{ ...ROW, 'AI Visibility': '✅ Claude Code (OTel)', Compliance: '✅ 100%' }],
    });
    setup();
    await screen.findByText('100%');
    expect(screen.getByText(READINESS_COPY.summary(3, 3))).toBeTruthy();
    expect(screen.queryByRole('button', { name: READINESS_COPY.addConnection })).toBeNull();
  });

  it('shows an unknown signal as unknown without a connection prompt', async () => {
    scorecard.list.mockResolvedValue({ count: 1, rows: [{ ...ROW, 'AI Visibility': '' }] });
    setup();
    await screen.findByText('66.6%');
    const ai = within(rowOf(READINESS_COPY.signals.ai.name));
    expect(ai.getByText(READINESS_COPY.unknown)).toBeTruthy();
    expect(ai.queryByRole('button')).toBeNull();
  });
});
