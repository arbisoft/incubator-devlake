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

import { MANAGED_ENV } from './components/__tests__/modal-test-utils';
import {
  buildManagedSettings,
  DEFAULT_SETTINGS_SELECTION,
  isLastSignal,
  SETTINGS_OPTION,
  type SettingsSelection,
} from './managed-settings';

const BASE = { env: MANAGED_ENV };

const ALL_OFF: SettingsSelection = {
  metrics: false,
  logs: false,
  promptText: false,
  toolDetails: false,
  repository: false,
};

const withOption = (option: keyof SettingsSelection): SettingsSelection => ({
  ...DEFAULT_SETTINGS_SELECTION,
  [option]: false,
});

describe('buildManagedSettings', () => {
  it('returns the server settings unchanged for the default selection', () => {
    const snapshot = structuredClone(BASE);
    const result = buildManagedSettings(BASE, DEFAULT_SETTINGS_SELECTION);
    expect(result).toEqual(BASE);
    expect(BASE).toEqual(snapshot);
  });

  it('disables the metrics exporter and drops the export interval', () => {
    const { env } = buildManagedSettings(BASE, withOption(SETTINGS_OPTION.METRICS))!;
    expect(env).toEqual({ ...omit(BASE.env, 'OTEL_METRIC_EXPORT_INTERVAL'), OTEL_METRICS_EXPORTER: 'none' });
  });

  it('disables the logs exporter', () => {
    const { env } = buildManagedSettings(BASE, withOption(SETTINGS_OPTION.LOGS))!;
    expect(env).toEqual({ ...BASE.env, OTEL_LOGS_EXPORTER: 'none' });
  });

  it.each([
    [SETTINGS_OPTION.PROMPT_TEXT, 'OTEL_LOG_USER_PROMPTS', '0'],
    [SETTINGS_OPTION.TOOL_DETAILS, 'OTEL_LOG_TOOL_DETAILS', '0'],
    [SETTINGS_OPTION.REPOSITORY, 'OTEL_METRICS_INCLUDE_REPOSITORY', 'false'],
  ])('turns off prompt text, tool details and repository independently (%s)', (option, key, value) => {
    const { env } = buildManagedSettings(BASE, withOption(option))!;
    expect(env).toEqual({ ...BASE.env, [key]: value });
  });

  it('keeps forced-off content flags and connection keys', () => {
    const { env } = buildManagedSettings(BASE, ALL_OFF)!;
    expect(env.OTEL_LOG_ASSISTANT_RESPONSES).toBe('0');
    expect(env.OTEL_LOG_TOOL_CONTENT).toBe('0');
    expect(env.OTEL_LOG_RAW_API_BODIES).toBe('0');
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe(BASE.env.OTEL_EXPORTER_OTLP_ENDPOINT);
    expect(env.OTEL_EXPORTER_OTLP_HEADERS).toBe(BASE.env.OTEL_EXPORTER_OTLP_HEADERS);
  });

  it('returns undefined without server settings', () => {
    expect(buildManagedSettings(undefined, DEFAULT_SETTINGS_SELECTION)).toBeUndefined();
  });
});

describe('isLastSignal', () => {
  it('is true only for the single remaining checked signal', () => {
    expect(isLastSignal(DEFAULT_SETTINGS_SELECTION, SETTINGS_OPTION.METRICS)).toBe(false);
    const metricsOff = withOption(SETTINGS_OPTION.METRICS);
    expect(isLastSignal(metricsOff, SETTINGS_OPTION.LOGS)).toBe(true);
    expect(isLastSignal(metricsOff, SETTINGS_OPTION.METRICS)).toBe(false);
    expect(isLastSignal(metricsOff, SETTINGS_OPTION.REPOSITORY)).toBe(false);
  });
});
