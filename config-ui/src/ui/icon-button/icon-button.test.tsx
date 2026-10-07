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

import { ICON_BUTTON_TONE } from './constants';
import { IconButton } from './icon-button';
import type { IconButtonProps } from './types';

const LABEL = 'Edit connection';

const setup = (props: Partial<IconButtonProps> = {}) => {
  const onClick = vi.fn();
  renderWithTheme(<IconButton icon={<span aria-hidden>i</span>} label={LABEL} onClick={onClick} {...props} />);
  return { onClick };
};

describe('IconButton', () => {
  it('is a button named by its label and calls back on click', () => {
    const { onClick } = setup();
    fireEvent.click(screen.getByRole('button', { name: LABEL }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows its label as a tooltip', async () => {
    setup();
    fireEvent.mouseEnter(screen.getByRole('button', { name: LABEL }));
    expect((await screen.findByRole('tooltip')).textContent).toBe(LABEL);
  });

  it('does not call back while disabled', () => {
    const { onClick } = setup({ disabled: true });
    fireEvent.click(screen.getByRole('button', { name: LABEL }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('marks only the danger tone as a danger button', () => {
    setup({ tone: ICON_BUTTON_TONE.DANGER });
    expect(screen.getByRole('button', { name: LABEL }).className).toContain('ant-btn-dangerous');
  });

  it('keeps the default and primary tones free of the danger style', () => {
    setup({ tone: ICON_BUTTON_TONE.PRIMARY });
    expect(screen.getByRole('button', { name: LABEL }).className).not.toContain('ant-btn-dangerous');
  });
});
