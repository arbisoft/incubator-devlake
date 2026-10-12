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

import { getTheme } from '@/theme/tokens';
import { pressEscape } from '@/ui/__tests__/keyboard';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import { COMMON_COPY, MODAL_WIDTH } from '@/ui/constants';

import { FormModal } from './form-modal';
import type { FormModalProps } from './types';

const TITLE = 'Add a new webhook';
const SUBMIT = 'Save';
const FIELD = 'Webhook name';
const REASON = 'Enter a name first';

const setup = (props: Partial<FormModalProps> = {}) => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  renderWithTheme(
    <FormModal
      open
      title={TITLE}
      submitLabel={SUBMIT}
      width={MODAL_WIDTH.MD}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    >
      <input aria-label={FIELD} />
    </FormModal>,
  );
  return { onSubmit, onCancel };
};

describe('FormModal', () => {
  it('is a dialog named by its title and renders its children', () => {
    setup();
    expect(screen.getByRole('dialog', { name: TITLE })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: FIELD })).toBeTruthy();
  });

  it('submits and cancels', () => {
    const { onSubmit, onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: SUBMIT }));
    expect(onSubmit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: COMMON_COPY.cancel }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('disables submit and explains why in a tooltip', async () => {
    const { onSubmit } = setup({ submitDisabled: true, disabledReason: REASON });
    const submit = screen.getByRole('button', { name: SUBMIT });
    expect(submit.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.mouseEnter(submit);
    expect((await screen.findByRole('tooltip')).textContent).toBe(REASON);
  });

  it('uses the width token for the chosen size', () => {
    setup({ width: MODAL_WIDTH.LG });
    const modal = screen.getByRole('dialog', { name: TITLE }).closest<HTMLElement>('.ant-modal');
    expect(modal?.style.width).toBe(`${getTheme('light').layout.modalWidth.lg}px`);
  });

  it('shows the busy state on submit', () => {
    setup({ loading: true });
    expect(screen.getByRole('button', { name: new RegExp(SUBMIT) }).className).toContain('ant-btn-loading');
  });

  it('closes on Escape', () => {
    const { onCancel } = setup();
    pressEscape(screen.getByRole('textbox', { name: FIELD }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
