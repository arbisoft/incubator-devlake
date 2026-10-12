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

import { COPY } from './constants';
import { IntegrationCard } from './integration-card';
import type { IntegrationCardProps } from './types';

const NAME = 'GitHub';
const CATEGORY = 'Code & SCM';

const setup = (props: Partial<IntegrationCardProps> = {}) => {
  const onAdd = vi.fn();
  const onManage = vi.fn();
  renderWithTheme(
    <IntegrationCard icon={() => null} name={NAME} category={CATEGORY} connected={0} onAdd={onAdd} {...props} />,
  );
  return { onAdd, onManage };
};

describe('IntegrationCard', () => {
  it('names the card after the integration and shows its category', () => {
    setup();
    expect(screen.getByRole('article', { name: NAME })).toBeTruthy();
    expect(screen.getByText(CATEGORY)).toBeTruthy();
  });

  it('offers only Add when nothing is connected', () => {
    const { onAdd } = setup();
    expect(screen.queryByRole('button', { name: COPY.manage(0) })).toBeNull();
    expect(screen.queryByText(COPY.connected(0))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: COPY.add }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('shows the counts and Manage when connected, with Add still reachable', () => {
    const onManage = vi.fn();
    const { onAdd } = setup({ connected: 3, failed: 1, onManage });
    expect(screen.getByText(COPY.connected(3))).toBeTruthy();
    expect(screen.getByText(COPY.failed(1))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: COPY.manage(3) }));
    expect(onManage).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: COPY.add }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('marks beta integrations in the category line', () => {
    setup({ beta: true });
    expect(screen.getByText(COPY.categoryBeta(CATEGORY))).toBeTruthy();
  });

  it('hides the failed count when none failed', () => {
    setup({ connected: 2, failed: 0, onManage: vi.fn() });
    expect(screen.queryByText(COPY.failed(0))).toBeNull();
  });
});
