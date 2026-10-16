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

import { Button } from 'antd';

import { COMMON_COPY } from '@/ui/constants';
import { EMPTY_ILLUSTRATION, EMPTY_STATE_SIZE, type EmptyStateProps } from '@/ui/empty-state';

import type { ListEmptyOptions } from './types';

export const buildListEmpty = ({ failed, onRetry, filtered, empty, noResults }: ListEmptyOptions): EmptyStateProps => {
  if (failed) {
    return {
      illustration: EMPTY_ILLUSTRATION.ERROR,
      title: COMMON_COPY.genericError,
      size: EMPTY_STATE_SIZE.SECTION,
      action: <Button onClick={onRetry}>{COMMON_COPY.retry}</Button>,
    };
  }
  return filtered ? { ...noResults, size: EMPTY_STATE_SIZE.SECTION } : { ...empty, size: EMPTY_STATE_SIZE.SECTION };
};
