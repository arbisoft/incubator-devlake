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

import { COPY as LAYOUT_COPY } from '@/routes/layout/constants';

import { COPY } from './constants';
import { getRouteErrorTitle } from './utils';

const UNEXPECTED_ERROR_DETAIL = 'service detail';

const routeError = (status: number) => ({
  status,
  statusText: 'Request failed',
  internal: true,
  data: UNEXPECTED_ERROR_DETAIL,
});

describe('getRouteErrorTitle', () => {
  it.each([404, 500])('returns only the HTTP status for route error %s', (status) => {
    expect(getRouteErrorTitle(routeError(status))).toBe(COPY.requestFailed(status));
  });

  it('preserves the known safe initialization message', () => {
    expect(getRouteErrorTitle(new Error(LAYOUT_COPY.initializationFailed))).toBe(LAYOUT_COPY.initializationFailed);
  });

  it('uses generic copy for unexpected errors', () => {
    expect(getRouteErrorTitle(new Error(UNEXPECTED_ERROR_DETAIL))).toBe(COPY.unknown);
    expect(getRouteErrorTitle({ message: UNEXPECTED_ERROR_DETAIL })).toBe(COPY.unknown);
    expect(getRouteErrorTitle(UNEXPECTED_ERROR_DETAIL)).toBe(COPY.unknown);
    expect(getRouteErrorTitle(null)).toBe(COPY.unknown);
  });
});
