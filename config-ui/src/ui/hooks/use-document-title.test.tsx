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

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BRAND_NAME } from '@/config/brand';

import { useDocumentTitle } from './use-document-title';

describe('useDocumentTitle', () => {
  it('sets "{page} · {BRAND_NAME}" and restores the previous title on unmount', () => {
    document.title = 'before';
    const { unmount, rerender } = renderHook(({ page }: { page?: string }) => useDocumentTitle(page), {
      initialProps: { page: 'Projects' },
    });
    expect(document.title).toBe(`Projects · ${BRAND_NAME}`);
    rerender({ page: 'Pipelines' });
    expect(document.title).toBe(`Pipelines · ${BRAND_NAME}`);
    unmount();
    expect(document.title).toBe('before');
  });

  it('uses just the brand name without a page', () => {
    renderHook(() => useDocumentTitle());
    expect(document.title).toBe(BRAND_NAME);
  });
});
