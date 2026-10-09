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
import { STATUS_TONE } from '@/ui/constants';

import { COPY } from './constants';
import { ProgressBanner } from './progress-banner';
import type { ProgressBannerProps } from './types';

const TITLE = 'Onboarding session';
const MESSAGE = 'Finish connecting your first tool.';
const ACTION = 'Continue';
const SECONDARY = 'Check dashboard';

const setup = (props: Partial<ProgressBannerProps> = {}) => {
  const onAction = vi.fn();
  const onDismiss = vi.fn();
  renderWithTheme(
    <ProgressBanner message={MESSAGE} actionLabel={ACTION} onAction={onAction} onDismiss={onDismiss} {...props} />,
  );
  return { onAction, onDismiss };
};

describe('ProgressBanner', () => {
  it('shows the step counter, the message and reports the action and dismiss', () => {
    const { onAction, onDismiss } = setup({ progress: { done: 1, total: 3 } });
    expect(screen.getByRole('region', { name: MESSAGE })).toBeTruthy();
    expect(screen.getByText(COPY.progress(1, 3))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: ACTION }));
    expect(onAction).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: COPY.dismiss }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('works without progress and names the region by its title when there is one', () => {
    setup({ title: TITLE });
    expect(screen.getByRole('region', { name: TITLE })).toBeTruthy();
    expect(screen.getByText(MESSAGE)).toBeTruthy();
    expect(screen.queryByText(COPY.progress(0, 0))).toBeNull();
  });

  it('renders a secondary action after the primary one', () => {
    const onClick = vi.fn();
    setup({ secondaryAction: { label: SECONDARY, onClick } });
    const buttons = screen.getAllByRole('button').map((button) => button.textContent);
    expect(buttons.indexOf(SECONDARY)).toBeGreaterThan(buttons.indexOf(ACTION));
    fireEvent.click(screen.getByRole('button', { name: SECONDARY }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows a spinner while loading and a tone icon otherwise, both hidden from assistive tech', () => {
    const { container, unmount } = renderWithTheme(
      <ProgressBanner loading message={MESSAGE} actionLabel={ACTION} onAction={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(container.querySelector('.anticon-loading')).not.toBeNull();
    unmount();
    const success = renderWithTheme(
      <ProgressBanner
        tone={STATUS_TONE.SUCCESS}
        message={MESSAGE}
        actionLabel={ACTION}
        onAction={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(success.container.querySelector('.anticon-check-circle')?.getAttribute('aria-hidden')).toBe('true');
  });
});
