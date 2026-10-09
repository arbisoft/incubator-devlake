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

import { GRAFANA_ERROR_CODE } from '@/api/grafana-users/constants';

import { COPY, GRAFANA_ERROR_MAP } from './constants';

describe('Grafana error copy', () => {
  it.each(Object.values(GRAFANA_ERROR_CODE))('maps %s to its copy', (code) => {
    expect(GRAFANA_ERROR_MAP[code]).toBe(COPY.errors[code]);
    expect(GRAFANA_ERROR_MAP[code]).not.toBe('');
  });

  it('keeps flow overrides after the base map spread', () => {
    const override = 'Flow specific copy.';
    const flowMap: Record<string, string> = { ...GRAFANA_ERROR_MAP, [GRAFANA_ERROR_CODE.USER_EXISTS]: override };
    expect(flowMap[GRAFANA_ERROR_CODE.USER_EXISTS]).toBe(override);
    expect(flowMap[GRAFANA_ERROR_CODE.UNAVAILABLE]).toBe(COPY.errors[GRAFANA_ERROR_CODE.UNAVAILABLE]);
  });

  it('never says username or login', () => {
    const copy = JSON.stringify([COPY, GRAFANA_ERROR_MAP]).toLowerCase();
    expect(copy).not.toContain('username');
    expect(copy).not.toContain('login');
  });

  it('pluralises the orphans notice', () => {
    expect(COPY.orphans.notice(1)).toContain('1 saved dashboard mapping belongs');
    expect(COPY.orphans.notice(3)).toContain('3 saved dashboard mappings belong');
  });
});
