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

import { describe, expect, it, vi } from 'vitest';

import type { IPipeline } from '@/types';

import { buildPipelineQuery, pickConfig, toBlueprintOptions, toTablePagination } from './utils';

describe('pipeline list query', () => {
  const QUERY = { page: 2, pageSize: 10, sortBy: 'beganAt', sortOrder: 'desc' } as const;

  it('sends the blueprint filter as blueprint_id', () => {
    expect(buildPipelineQuery(QUERY, { blueprintId: '7' })).toEqual({ ...QUERY, blueprint_id: '7' });
  });

  it('omits blueprint_id when no blueprint is picked', () => {
    expect(buildPipelineQuery(QUERY, { blueprintId: '' }).blueprint_id).toBeUndefined();
  });
});

describe('toBlueprintOptions', () => {
  it('turns blueprints into select options keyed by id', () => {
    expect(toBlueprintOptions([{ id: 3, name: 'alpha' }])).toEqual([{ value: '3', label: 'alpha' }]);
  });

  it('is empty before the blueprints load', () => {
    expect(toBlueprintOptions()).toEqual([]);
  });

  it('keeps the picked blueprint listed even when a search no longer returns it', () => {
    const options = toBlueprintOptions([{ id: 4, name: 'beta' }], { id: 3, name: 'alpha' });
    expect(options.map(({ value }) => value)).toEqual(['3', '4']);
  });

  it('does not list the picked blueprint twice', () => {
    expect(toBlueprintOptions([{ id: 3, name: 'alpha' }], { id: 3, name: 'alpha' })).toHaveLength(1);
  });
});

describe('pickConfig', () => {
  it('keeps the id, name, plan and skip-on-fail fields only', () => {
    const pipeline = { id: 9, name: 'bp', plan: [[]], skipOnFail: true, status: 'TASK_COMPLETED', totalTasks: 4 };
    expect(pickConfig(pipeline as unknown as IPipeline)).toEqual({ id: 9, name: 'bp', plan: [[]], skipOnFail: true });
  });
});

describe('toTablePagination', () => {
  it('adapts the legacy shape and resets to the first page on a size change', () => {
    const onChange = vi.fn();
    const adapted = toTablePagination({ current: 3, pageSize: 10, total: 42, onChange });
    expect(adapted).toMatchObject({ page: 3, pageSize: 10, total: 42 });
    adapted.onPageChange(4);
    expect(onChange).toHaveBeenLastCalledWith(4);
    adapted.onPageSizeChange();
    expect(onChange).toHaveBeenLastCalledWith(1);
  });
});
