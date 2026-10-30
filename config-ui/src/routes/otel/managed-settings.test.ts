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

import { omit } from 'lodash';
import { describe, expect, it } from 'vitest';

import { MANAGED_ENV } from './__tests__/fixtures';
import {
  buildManagedSettings,
  DEFAULT_SETTINGS_SELECTION,
  estimateStorage,
  hasSingleSignal,
  isLastSignal,
} from './managed-settings';
import { SETTINGS_OPTION } from './settings-option-constants';
import type { SettingsSelection } from './types';

const BASE = { env: MANAGED_ENV };

const ALL_OFF: SettingsSelection = {
  metrics: false,
  logs: false,
  promptText: false,
  toolDetails: false,
  repository: false,
};

const withoutOption = (option: keyof SettingsSelection): SettingsSelection => ({
  ...DEFAULT_SETTINGS_SELECTION,
  [option]: false,
});

const shapedEnv = (selection: SettingsSelection) => buildManagedSettings(BASE, selection)?.env ?? {};

describe('buildManagedSettings', () => {
  it('returns the server settings unchanged for the default selection', () => {
    expect(buildManagedSettings(BASE, DEFAULT_SETTINGS_SELECTION)).toEqual(BASE);
  });

  it('does not mutate the server settings', () => {
    const snapshot = structuredClone(BASE);
    buildManagedSettings(BASE, withoutOption(SETTINGS_OPTION.METRICS));
    expect(BASE).toEqual(snapshot);
  });

  it('disables the metrics exporter, drops the export interval and repository attribution', () => {
    const env = shapedEnv(withoutOption(SETTINGS_OPTION.METRICS));
    expect(env).toEqual({
      ...omit(BASE.env, 'OTEL_METRIC_EXPORT_INTERVAL'),
      OTEL_METRICS_EXPORTER: 'none',
      OTEL_METRICS_INCLUDE_REPOSITORY: 'false',
    });
  });

  it.each([
    [SETTINGS_OPTION.PROMPT_TEXT, 'OTEL_LOG_USER_PROMPTS', '0'],
    [SETTINGS_OPTION.TOOL_DETAILS, 'OTEL_LOG_TOOL_DETAILS', '0'],
    [SETTINGS_OPTION.REPOSITORY, 'OTEL_METRICS_INCLUDE_REPOSITORY', 'false'],
  ])('turns off prompt text, tool details and repository independently (%s)', (option, key, value) => {
    const env = shapedEnv(withoutOption(option));
    expect(env).toEqual({ ...BASE.env, [key]: value });
  });

  it('turns every events option off with events and keeps forced-off flags', () => {
    const env = shapedEnv({ ...ALL_OFF, metrics: true });
    expect(env).toEqual({
      ...BASE.env,
      OTEL_LOGS_EXPORTER: 'none',
      OTEL_LOG_USER_PROMPTS: '0',
      OTEL_LOG_TOOL_DETAILS: '0',
      OTEL_METRICS_INCLUDE_REPOSITORY: 'false',
    });
  });

  it('writes events children off while events are off, keeping repository attribution', () => {
    const env = shapedEnv(withoutOption(SETTINGS_OPTION.LOGS));
    expect(env).toEqual({
      ...BASE.env,
      OTEL_LOGS_EXPORTER: 'none',
      OTEL_LOG_USER_PROMPTS: '0',
      OTEL_LOG_TOOL_DETAILS: '0',
    });
  });

  it('keeps repository attribution in a metrics-only snippet', () => {
    const env = shapedEnv({ ...DEFAULT_SETTINGS_SELECTION, logs: false });
    expect(env.OTEL_METRICS_INCLUDE_REPOSITORY).toBe(BASE.env.OTEL_METRICS_INCLUDE_REPOSITORY);
    expect(env.OTEL_METRICS_INCLUDE_REPOSITORY).not.toBe('false');
  });

  it('turns repository attribution off with metrics, even when it stays selected', () => {
    const env = shapedEnv(withoutOption(SETTINGS_OPTION.METRICS));
    expect(env.OTEL_METRICS_INCLUDE_REPOSITORY).toBe('false');
  });

  it('does not tie repository attribution to events in an events-only snippet', () => {
    const env = shapedEnv({ ...DEFAULT_SETTINGS_SELECTION, metrics: false });
    expect(env.OTEL_METRICS_EXPORTER).toBe('none');
    expect(env.OTEL_LOG_USER_PROMPTS).toBe(BASE.env.OTEL_LOG_USER_PROMPTS);
  });

  it('returns undefined when no signal is on', () => {
    expect(buildManagedSettings(BASE, ALL_OFF)).toBeUndefined();
  });

  it('returns undefined without server settings', () => {
    expect(buildManagedSettings(undefined, DEFAULT_SETTINGS_SELECTION)).toBeUndefined();
  });
});

describe('isLastSignal', () => {
  it('is true only for the single remaining checked signal', () => {
    expect(isLastSignal(DEFAULT_SETTINGS_SELECTION, SETTINGS_OPTION.METRICS)).toBe(false);
    const metricsOff = withoutOption(SETTINGS_OPTION.METRICS);
    expect(isLastSignal(metricsOff, SETTINGS_OPTION.LOGS)).toBe(true);
    expect(isLastSignal(metricsOff, SETTINGS_OPTION.METRICS)).toBe(false);
    expect(isLastSignal(metricsOff, SETTINGS_OPTION.REPOSITORY)).toBe(false);
  });
});

describe('hasSingleSignal', () => {
  it('is true only when exactly one signal is on', () => {
    expect(hasSingleSignal(DEFAULT_SETTINGS_SELECTION)).toBe(false);
    expect(hasSingleSignal(withoutOption(SETTINGS_OPTION.METRICS))).toBe(true);
  });
});

describe('estimateStorage', () => {
  it.each([
    ['default', DEFAULT_SETTINGS_SELECTION, { rawMb: 73, monthlyMb: 21 }],
    ['events off', withoutOption(SETTINGS_OPTION.LOGS), { rawMb: 30, monthlyMb: 4 }],
    [
      'metrics off with repository still selected',
      { ...withoutOption(SETTINGS_OPTION.METRICS), repository: true },
      { rawMb: 43, monthlyMb: 17 },
    ],
  ])('estimates storage for the selected signals (%s)', (_name, selection, expected) => {
    expect(estimateStorage(selection)).toEqual(expected);
  });
});
