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

import { pick } from 'lodash';

import type { ListParams } from '@/api/pipeline';
import type { IBlueprint, IPipeline } from '@/types';
import type { ListQuery } from '@/ui';

import { PICKED_CONFIG_FIELDS } from './constants';
import type { LegacyPagination, PipelineFilters, PipelineSortKey } from './types';

export const buildPipelineQuery = (
  query: ListQuery<PipelineSortKey>,
  { blueprintId }: PipelineFilters,
): ListParams => ({
  page: query.page,
  pageSize: query.pageSize,
  sortBy: query.sortBy,
  sortOrder: query.sortOrder,
  blueprint_id: blueprintId || undefined,
});

type BlueprintSummary = Pick<IBlueprint, 'id' | 'name'>;

export const toBlueprintOptions = (blueprints: BlueprintSummary[] = [], selected?: BlueprintSummary) => {
  const all = selected && !blueprints.some(({ id }) => id === selected.id) ? [selected, ...blueprints] : blueprints;
  return all.map(({ id, name }) => ({ value: String(id), label: name }));
};

export const pickConfig = (pipeline: IPipeline) => pick(pipeline, PICKED_CONFIG_FIELDS);

export const toTablePagination = ({ current, pageSize, total, onChange }: LegacyPagination) => ({
  page: current,
  pageSize,
  total,
  onPageChange: onChange,
  onPageSizeChange: () => onChange(1),
});
