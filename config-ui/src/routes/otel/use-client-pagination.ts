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

import { useMemo, useState } from 'react';

import { DEFAULT_PAGE } from '@/ui';

import { DEFAULT_OTEL_PAGE_SIZE, OTEL_PAGE_SIZE_OPTIONS } from './constants';

export const useClientPagination = <T>(items: T[]) => {
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_OTEL_PAGE_SIZE);

  const lastPage = Math.max(DEFAULT_PAGE, Math.ceil(items.length / pageSize));
  const current = Math.min(page, lastPage);

  const rows = useMemo(() => items.slice((current - 1) * pageSize, current * pageSize), [items, current, pageSize]);

  const pagination = {
    page: current,
    pageSize,
    total: items.length,
    pageSizeOptions: OTEL_PAGE_SIZE_OPTIONS,
    onPageChange: setPage,
    onPageSizeChange: (size: number) => {
      setPageSize(size);
      setPage(DEFAULT_PAGE);
    },
  };

  return { rows, pagination };
};
