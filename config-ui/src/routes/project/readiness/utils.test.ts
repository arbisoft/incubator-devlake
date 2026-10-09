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

import { describe, expect, it } from 'vitest';

import type { ComplianceScorecardRow } from '@/api/compliance-scorecard';

import { COPY, READINESS_SIGNAL, SIGNAL_STATE } from './constants';
import { formatPercent, getMissingHint, toReadiness, toReadinessMap } from './utils';

const row = (overrides: Partial<ComplianceScorecardRow> = {}): ComplianceScorecardRow => ({
  Project: 'Supercal',
  'Issue Visibility': '✅ Jira',
  'PR Visibility': '✅ GitHub',
  'AI Visibility': '❌ Not available',
  Compliance: '⚠️ 66.6%',
  ...overrides,
});

describe('formatPercent', () => {
  it.each([
    ['🚨 00.0%', '0%'],
    ['🔶 33.3%', '33.3%'],
    ['⚠️ 66.6%', '66.6%'],
    ['✅ 100%', '100%'],
    ['50.0%', '50%'],
  ])('formats %s as %s', (raw, expected) => {
    expect(formatPercent(raw)).toBe(expected);
  });

  it.each([undefined, '', '🚨 n/a', 42, null])('returns null for %s', (raw) => {
    expect(formatPercent(raw)).toBeNull();
  });
});

describe('toReadiness', () => {
  it('maps available and missing signals with the API percentage', () => {
    const readiness = toReadiness(row());
    expect(readiness.project).toBe('Supercal');
    expect(readiness.signals).toEqual([
      { key: READINESS_SIGNAL.ISSUE, state: SIGNAL_STATE.AVAILABLE, sources: ['Jira'] },
      { key: READINESS_SIGNAL.PR, state: SIGNAL_STATE.AVAILABLE, sources: ['GitHub'] },
      { key: READINESS_SIGNAL.AI, state: SIGNAL_STATE.MISSING, sources: [] },
    ]);
    expect(readiness.available).toBe(2);
    expect(readiness.total).toBe(3);
    expect(readiness.percentLabel).toBe('66.6%');
  });

  it('splits several sources on comma and space', () => {
    const readiness = toReadiness(row({ 'Issue Visibility': '✅ Jira, Linear,  Claude Code (OTel) ' }));
    expect(readiness.signals[0].sources).toEqual(['Jira', 'Linear', 'Claude Code (OTel)']);
  });

  it('keeps the API percentage even when it disagrees with the signal count', () => {
    const readiness = toReadiness(row({ Compliance: '✅ 100%' }));
    expect(readiness.available).toBe(2);
    expect(readiness.percentLabel).toBe('100%');
  });

  it.each(['', '   ', 'Jira', '?', undefined])('treats %j as unknown', (value) => {
    const readiness = toReadiness(row({ 'AI Visibility': value }));
    expect(readiness.signals[2]).toEqual({ key: READINESS_SIGNAL.AI, state: SIGNAL_STATE.UNKNOWN, sources: [] });
    expect(readiness.available).toBe(2);
  });

  it('treats a marker without a label as available with no sources', () => {
    expect(toReadiness(row({ 'PR Visibility': '✅' })).signals[1]).toEqual({
      key: READINESS_SIGNAL.PR,
      state: SIGNAL_STATE.AVAILABLE,
      sources: [],
    });
  });

  it('survives a row with only a project name', () => {
    const readiness = toReadiness({ Project: 'Bare' });
    expect(readiness.available).toBe(0);
    expect(readiness.percentLabel).toBeNull();
    expect(readiness.signals.every(({ state }) => state === SIGNAL_STATE.UNKNOWN)).toBe(true);
  });
});

describe('toReadinessMap', () => {
  it('matches projects by exact name', () => {
    const map = toReadinessMap([row(), row({ Project: 'supercal' })]);
    expect(map.size).toBe(2);
    expect(map.get('Supercal')?.project).toBe('Supercal');
    expect(map.has('Super')).toBe(false);
  });

  it('returns nothing for a missing response', () => {
    expect(toReadinessMap(undefined).size).toBe(0);
  });

  it('skips malformed rows', () => {
    const malformed = [null, {}, { Project: 42 }, { Project: '' }, row()] as unknown as ComplianceScorecardRow[];
    expect([...toReadinessMap(malformed).keys()]).toEqual(['Supercal']);
  });
});

describe('getMissingHint', () => {
  it('names the single missing signal', () => {
    expect(getMissingHint(toReadiness(row()))).toBe(COPY.missingHint([COPY.signals.ai.missing]));
  });

  it('names two missing signals together', () => {
    const hint = getMissingHint(toReadiness(row({ 'PR Visibility': '❌ Not available' })));
    expect(hint).toBe(COPY.missingHint([COPY.signals.pr.missing, COPY.signals.ai.missing]));
    expect(hint).toContain(' and ');
  });

  it('is empty when nothing is missing', () => {
    expect(getMissingHint(toReadiness(row({ 'AI Visibility': '✅ Claude Code (OTel)' })))).toBeNull();
  });

  it('does not call an unknown signal missing', () => {
    expect(getMissingHint(toReadiness(row({ 'AI Visibility': undefined })))).toBeNull();
  });
});
