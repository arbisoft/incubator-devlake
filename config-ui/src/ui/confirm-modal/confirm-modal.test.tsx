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

import { pressEscape } from '@/ui/__tests__/keyboard';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import { COMMON_COPY } from '@/ui/constants';

import { ConfirmModal } from './confirm-modal';
import { CONFIRM_TONE } from './constants';
import type { ConfirmModalProps } from './types';

const TITLE = 'Delete "Arbisoft Website"?';
const DESCRIPTION = 'Scripts using this key will lose access.';
const CONFIRM = 'Delete API key';

const setup = (props: Partial<ConfirmModalProps> = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  renderWithTheme(
    <ConfirmModal
      open
      tone={CONFIRM_TONE.DANGER}
      title={TITLE}
      description={DESCRIPTION}
      confirmLabel={CONFIRM}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
};

describe('ConfirmModal', () => {
  it('is a dialog named by its title and described by its text', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: TITLE });
    expect(dialog.getAttribute('aria-describedby')).toBe(screen.getByText(DESCRIPTION).id);
  });

  it('focuses Cancel first and reports both actions', () => {
    const { onConfirm, onCancel } = setup();
    const cancel = screen.getByRole('button', { name: COMMON_COPY.cancel });
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(screen.getByRole('button', { name: CONFIRM }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('uses the filled danger button only for the danger tone', () => {
    setup();
    expect(screen.getByRole('button', { name: CONFIRM }).className).toContain('ant-btn-dangerous');
  });

  it('keeps the default tone free of danger styling and honours a custom cancel label', () => {
    setup({ tone: CONFIRM_TONE.DEFAULT, cancelLabel: 'Keep it' });
    expect(screen.getByRole('button', { name: CONFIRM }).className).not.toContain('ant-btn-dangerous');
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeTruthy();
  });

  it('shows extra notes under the description and can disable the confirm action', () => {
    const { onConfirm } = setup({ confirmDisabled: true, children: <p>Shared keys stay active.</p> });
    expect(screen.getByText('Shared keys stay active.')).toBeTruthy();
    const confirm = screen.getByRole<HTMLButtonElement>('button', { name: CONFIRM });
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const { onCancel } = setup();
    pressEscape(screen.getByRole('dialog', { name: TITLE }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('blocks cancelling while the action runs', () => {
    setup({ loading: true });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: COMMON_COPY.cancel }).disabled).toBe(true);
  });

  it('renders nothing while closed', () => {
    setup({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
