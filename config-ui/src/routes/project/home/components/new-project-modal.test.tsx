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

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from '../constants';

import { NewProjectModal } from './new-project-modal';

vi.mock('antd', async (importOriginal) => ({
  ...(await importOriginal<typeof import('antd')>()),
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/api', () => ({ default: { project: { create: vi.fn() } } }));

const field = () => screen.getByRole<HTMLInputElement>('textbox', { name: new RegExp(COPY.create.name.label) });

describe('NewProjectModal', () => {
  it('stays mounted while closed and starts empty again after a cancel', () => {
    const onClose = vi.fn();
    const { rerender } = renderWithTheme(<NewProjectModal open onClose={onClose} onCreated={vi.fn()} />);
    fireEvent.change(field(), { target: { value: 'alpha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    rerender(<NewProjectModal open={false} onClose={onClose} onCreated={vi.fn()} />);
    rerender(<NewProjectModal open onClose={onClose} onCreated={vi.fn()} />);
    expect(field().value).toBe('');
  });
});
