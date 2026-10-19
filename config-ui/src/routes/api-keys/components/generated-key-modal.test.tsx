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

import { fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from '../constants';

import { GeneratedKeyModal } from './generated-key-modal';

const mockCopy = vi.hoisted(() => ({
  text: '',
  onCopy: undefined as ((value: string, success: boolean) => void) | undefined,
}));
const mockMessage = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock('antd', async (importOriginal) => ({
  ...(await importOriginal<typeof import('antd')>()),
  message: mockMessage,
}));
vi.mock('react-copy-to-clipboard', () => ({
  CopyToClipboard: ({
    text,
    onCopy,
    children,
  }: {
    text: string;
    onCopy: (value: string, success: boolean) => void;
    children: ReactNode;
  }) => {
    mockCopy.text = text;
    mockCopy.onCopy = onCopy;
    return <>{children}</>;
  },
}));

const API_KEY = '{"key":"test-value"}';
const requireControl = <T extends Element>(value: T | null | undefined): T => {
  if (!value) throw new Error('Expected generated-key control to be present.');
  return value;
};

const setup = () => {
  const onClose = vi.fn();
  const onClosed = vi.fn();
  const rendered = renderWithTheme(<GeneratedKeyModal open apiKey={API_KEY} onClose={onClose} onClosed={onClosed} />);
  return { ...rendered, onClose, onClosed };
};

describe('GeneratedKeyModal', () => {
  afterEach(() => {
    mockCopy.text = '';
    mockCopy.onCopy = undefined;
    mockMessage.success.mockClear();
  });

  it('renders the API key as byte-identical visible text', () => {
    setup();
    const text = requireControl(document.body.querySelector(`[aria-label="${COPY.generated.keyLabel}"]`));
    expect(text.textContent === API_KEY).toBeTruthy();
  });

  it('copies the same API key and gives safe success feedback', () => {
    setup();
    requireControl(document.body.querySelector<HTMLButtonElement>(`button[aria-label="${COPY.generated.copy}"]`));
    const { onCopy } = mockCopy;
    if (!onCopy) throw new Error('Expected generated-key copy callback to be present.');
    onCopy(mockCopy.text, true);
    expect(mockCopy.text === API_KEY).toBeTruthy();
    expect(mockMessage.success).toHaveBeenCalledExactlyOnceWith(COPY.generated.copied);
  });

  it('does not show success feedback when copying fails', () => {
    setup();
    const { onCopy } = mockCopy;
    if (!onCopy) throw new Error('Expected generated-key copy callback to be present.');
    onCopy(mockCopy.text, false);
    expect(mockMessage.success).not.toHaveBeenCalled();
  });

  it('does not dismiss through Escape, the mask, or the close icon', () => {
    const { onClose } = setup();
    const dialog = requireControl(document.body.querySelector<HTMLElement>('[role="dialog"]'));
    expect(dialog?.closest('.ant-modal')?.querySelector('.ant-modal-close')).toBeNull();
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });
    const modalWrap = requireControl(dialog.closest<HTMLElement>('.ant-modal-wrap'));
    fireEvent.mouseDown(modalWrap);
    fireEvent.click(modalWrap);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes through Done and acknowledges the closed key once', async () => {
    const { onClose, onClosed, rerender } = setup();
    const done = requireControl(
      Array.from(document.body.querySelectorAll<HTMLButtonElement>('.ant-modal-footer button')).find(
        (button) => button.textContent === COPY.generated.done,
      ),
    );
    fireEvent.click(done);
    expect(onClose).toHaveBeenCalledOnce();
    rerender(<GeneratedKeyModal open={false} apiKey={API_KEY} onClose={onClose} onClosed={onClosed} />);
    const modal = requireControl(document.querySelector<HTMLElement>('.ant-modal'));
    await waitFor(() => expect(modal.classList.contains('ant-zoom-leave-active')).toBe(true), {
      onTimeout: () => new Error('Expected generated-key modal close transition.'),
    });
    fireEvent.transitionEnd(modal);
    expect(onClosed).toHaveBeenCalledOnce();
  });
});
