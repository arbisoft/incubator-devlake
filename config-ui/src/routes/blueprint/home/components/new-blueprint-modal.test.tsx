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

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from '../constants';

import { NewBlueprintModal } from './new-blueprint-modal';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('@/api', () => ({ default: { blueprint: { create } } }));

const BASE_PAYLOAD = { name: 'alpha', enable: true, cronConfig: '0 0 * * *', isManual: false, skipOnFail: true };
const { name: nameField, mode: modeField } = COPY.create;

const setup = () => {
  const onCreated = vi.fn();
  renderWithTheme(<NewBlueprintModal open onClose={vi.fn()} onCreated={onCreated} />);
  fireEvent.change(screen.getByRole('textbox', { name: new RegExp(nameField.label) }), { target: { value: 'alpha' } });
  return onCreated;
};

describe('NewBlueprintModal', () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({});
  });

  it('does not submit without a name', () => {
    renderWithTheme(<NewBlueprintModal open onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.create.submit }));
    expect(create).not.toHaveBeenCalled();
  });

  const submit = async (mode?: string) => {
    const onCreated = setup();
    if (mode) fireEvent.click(screen.getByRole('radio', { name: mode }));
    fireEvent.click(screen.getByRole('button', { name: COPY.create.submit }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  };

  it('creates a normal blueprint with an empty connection list', async () => {
    await submit();
    expect(create).toHaveBeenCalledExactlyOnceWith({ ...BASE_PAYLOAD, mode: 'NORMAL', connections: [] });
  });

  it('creates an advanced blueprint with an empty plan', async () => {
    await submit(modeField.advanced);
    expect(create).toHaveBeenCalledExactlyOnceWith({ ...BASE_PAYLOAD, mode: 'ADVANCED', plan: [[]] });
  });
});
