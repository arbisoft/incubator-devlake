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

import { IBPMode } from '@/types';

import { STATUS_FILTER, TYPE_FILTER_ALL } from './constants';
import { buildBlueprintCreatePayload, buildBlueprintQuery, getTypeOptions, toEnableParam, toStatusKey } from './utils';

describe('routes/blueprint/home/utils', () => {
  it('normal blueprint create payload does not set a default timeAfter', () => {
    const payload = buildBlueprintCreatePayload('github history', IBPMode.NORMAL, '0 0 * * *');

    expect(Object.hasOwn(payload, 'timeAfter')).toBe(false);
    expect(payload.connections).toStrictEqual([]);
  });

  it('advanced blueprint create payload does not set a default timeAfter', () => {
    const payload = buildBlueprintCreatePayload('advanced history', IBPMode.ADVANCED, '0 0 * * *');

    expect(Object.hasOwn(payload, 'timeAfter')).toBe(false);
    expect(payload.plan).toStrictEqual([[]]);
  });
});

describe('blueprint list query', () => {
  const QUERY = { page: 2, pageSize: 10, keyword: 'git', sortBy: 'name', sortOrder: 'asc' } as const;

  it('maps the status filter to the enable param', () => {
    expect(toEnableParam(STATUS_FILTER.ENABLED)).toBe(true);
    expect(toEnableParam(STATUS_FILTER.DISABLED)).toBe(false);
    expect(toEnableParam(STATUS_FILTER.ALL)).toBeUndefined();
  });

  it('maps the enable flag back to a status key', () => {
    expect(toStatusKey(true)).toBe(STATUS_FILTER.ENABLED);
    expect(toStatusKey(false)).toBe(STATUS_FILTER.DISABLED);
  });

  it('keeps the list query and upper-cases the type as before', () => {
    expect(buildBlueprintQuery(QUERY, { type: 'Daily', status: STATUS_FILTER.ENABLED })).toEqual({
      ...QUERY,
      type: 'DAILY',
      enable: true,
    });
  });

  it('sends the all type and no enable filter by default', () => {
    expect(buildBlueprintQuery(QUERY, { type: TYPE_FILTER_ALL, status: STATUS_FILTER.ALL })).toMatchObject({
      type: 'ALL',
      enable: undefined,
    });
  });

  it('offers all, then every frequency, as type options', () => {
    expect(getTypeOptions().map(({ value }) => value)).toEqual([
      TYPE_FILTER_ALL,
      'Manual',
      'Daily',
      'Weekly',
      'Monthly',
      'Custom',
    ]);
  });
});
