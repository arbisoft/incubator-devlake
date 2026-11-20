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

import type { ListParams } from '@/api/blueprint';
import { getCronOptions } from '@/config';
import { IBPMode } from '@/types';
import type { BlueprintCreatePayload } from '@/types/blueprint';
import type { ListFilterOption, ListQuery } from '@/ui';

import { STATUS_FILTER } from './constants';
import type { BlueprintFilters, BlueprintSortKey } from './types';

export const buildBlueprintCreatePayload = (
  name: string,
  mode: IBPMode,
  cronConfig: string,
): BlueprintCreatePayload => {
  const payload: BlueprintCreatePayload = {
    name,
    mode,
    enable: true,
    cronConfig,
    isManual: false,
    skipOnFail: true,
  };

  if (mode === IBPMode.NORMAL) {
    payload.connections = [];
  }

  if (mode === IBPMode.ADVANCED) {
    payload.plan = [[]];
  }

  return payload;
};

export const toEnableParam = (status: string) => {
  if (status === STATUS_FILTER.ENABLED) return true;
  return status === STATUS_FILTER.DISABLED ? false : undefined;
};

export const toStatusKey = (enable: boolean) => (enable ? STATUS_FILTER.ENABLED : STATUS_FILTER.DISABLED);

export const buildBlueprintQuery = (
  query: ListQuery<BlueprintSortKey>,
  { connection, type, projectName, status }: BlueprintFilters,
): ListParams => ({
  ...query,
  type: type.length ? type.map((item) => item.toLocaleUpperCase()) : undefined,
  connection,
  projectName,
  enable: toEnableParam(status),
});

export const getTypeOptions = (): ListFilterOption[] =>
  getCronOptions().map(({ label }) => ({ text: label, value: label }));
