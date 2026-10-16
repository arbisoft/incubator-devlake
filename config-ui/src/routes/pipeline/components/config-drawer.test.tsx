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

import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from '../constants';

import { PipelineConfigDrawer } from './config-drawer';

describe('PipelineConfigDrawer', () => {
  it('names the drawer after the pipeline and shows its configuration as JSON', () => {
    renderWithTheme(<PipelineConfigDrawer open id={2361} config={{ id: 2361, name: 'bp' }} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: COPY.drawer.title(2361) })).toBeTruthy();
    expect(screen.getByText(COPY.drawer.heading)).toBeTruthy();
    expect(screen.getByText(/"name": "bp"/)).toBeTruthy();
    expect(screen.getByRole('button', { name: COPY.drawer.copy })).toBeTruthy();
  });

  it('renders nothing while closed', () => {
    renderWithTheme(<PipelineConfigDrawer open={false} id={1} config={{}} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
