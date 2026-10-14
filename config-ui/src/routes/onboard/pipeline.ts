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

import API from '@/api';
import { getErrorResponse } from '@/features/connections/utils';

import { COPY } from './constants';

const isPipelineId = (value: unknown): value is ID => {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0;
  }

  return typeof value === 'string' && /^\d+$/.test(value) && Number(value) > 0;
};

const getPipelineId = (value: unknown): ID | undefined => {
  if (!value || typeof value !== 'object' || !('id' in value)) {
    return undefined;
  }

  return isPipelineId(value.id) ? value.id : undefined;
};

const getFirstPipelineId = (value: unknown): ID | undefined => {
  if (!value || typeof value !== 'object' || !('pipelines' in value) || !Array.isArray(value.pipelines)) {
    return undefined;
  }

  return value.pipelines.map(getPipelineId).find((id) => id !== undefined);
};

export const triggerOnboardPipeline = async (blueprintId: ID): Promise<ID> => {
  const result: unknown = await API.blueprint.trigger(blueprintId, { skipCollectors: false, fullSync: false });
  const triggeredPipelineId = getPipelineId(result);

  if (triggeredPipelineId !== undefined) {
    return triggeredPipelineId;
  }

  const list: unknown = await API.blueprint.pipelines(blueprintId);
  const listedPipelineId = getFirstPipelineId(list);

  if (listedPipelineId !== undefined) {
    return listedPipelineId;
  }

  throw new Error(COPY.scope.pipelineUnavailable);
};

export const toOnboardCollectionErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message === COPY.scope.pipelineUnavailable) {
    return COPY.scope.pipelineUnavailable;
  }

  const reason = getErrorResponse(error)?.data.message;
  return typeof reason === 'string' ? reason : COPY.scope.operationFailed;
};
