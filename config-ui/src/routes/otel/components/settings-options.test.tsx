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

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OTEL_STATUS } from '@/api/otel';
import { finishModalExit } from '@/ui/__tests__/modal-exit';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';
import { COPY as CODE_COPY } from '@/ui/code-block/constants';

import { MANAGED_ENV } from '../__tests__/fixtures';

import { connection, otelCredential } from './__tests__/modal-test-utils';
import { COPY } from './constants';
import { SnippetModal } from './snippet-modal';

const credential = { ...connection(), managedSettings: { env: MANAGED_ENV } };
const OPTIONS = COPY.snippet.options;

const shownEnv = () => JSON.parse(screen.getByLabelText(CODE_COPY.region).textContent ?? '').env;
const checkbox = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name });

describe('SettingsOptions in the snippet modal', () => {
  it('shows the server settings by default', () => {
    renderWithTheme(<SnippetModal open credential={credential} onClose={vi.fn()} onClosed={vi.fn()} />);
    expect(shownEnv()).toEqual(MANAGED_ENV);
    expect(screen.queryByText(OPTIONS.lastSignal)).toBeNull();
  });

  it('unchecking events writes the disabled logs exporter', () => {
    renderWithTheme(<SnippetModal open credential={credential} onClose={vi.fn()} onClosed={vi.fn()} />);
    fireEvent.click(checkbox(OPTIONS.logs.label));
    expect(shownEnv().OTEL_LOGS_EXPORTER).toBe('none');
  });

  it.each([OPTIONS.promptText.label, OPTIONS.toolDetails.label])('hides %s while events are off', (label) => {
    renderWithTheme(<SnippetModal open credential={credential} onClose={vi.fn()} onClosed={vi.fn()} />);
    expect(checkbox(label).checked).toBe(true);
    fireEvent.click(checkbox(OPTIONS.logs.label));
    expect(screen.queryByRole('checkbox', { name: label })).toBeNull();
  });

  it('keeps the last signal checked', () => {
    renderWithTheme(<SnippetModal open credential={credential} onClose={vi.fn()} onClosed={vi.fn()} />);
    fireEvent.click(checkbox(OPTIONS.metrics.label));
    const events = checkbox(OPTIONS.logs.label);
    expect(events.checked).toBe(true);
    expect(events.disabled).toBe(true);
    fireEvent.click(events);
    expect(events.checked).toBe(true);
    expect(shownEnv().OTEL_METRICS_EXPORTER).toBe('none');
    expect(screen.getByText(OPTIONS.lastSignal)).toBeTruthy();
  });

  it('explains why the last signal is locked', () => {
    renderWithTheme(<SnippetModal open credential={credential} onClose={vi.fn()} onClosed={vi.fn()} />);
    const group = within(screen.getByRole('group', { name: OPTIONS.title }));
    expect(group.getAllByRole('status').some((node) => node.textContent === '')).toBe(true);
    fireEvent.click(checkbox(OPTIONS.metrics.label));
    const ids = (checkbox(OPTIONS.logs.label).getAttribute('aria-describedby') ?? '').split(' ');
    const [, hintId] = ids;
    const hint = document.getElementById(hintId);
    expect(ids).toHaveLength(2);
    expect(hint?.getAttribute('role')).toBe('status');
    expect(hint?.textContent).toBe(OPTIONS.lastSignal);
    expect(group.getByText(OPTIONS.lastSignal)).toBe(hint);
  });

  it('nests repository under events', () => {
    renderWithTheme(<SnippetModal open credential={credential} onClose={vi.fn()} onClosed={vi.fn()} />);
    fireEvent.click(checkbox(OPTIONS.logs.label));
    expect(screen.queryByRole('checkbox', { name: OPTIONS.repository.label })).toBeNull();
    fireEvent.click(checkbox(OPTIONS.logs.label));
    expect(checkbox(OPTIONS.repository.label)).toBeTruthy();
  });

  it('explains a content option with its own storage line', async () => {
    renderWithTheme(<SnippetModal open credential={credential} onClose={vi.fn()} onClosed={vi.fn()} />);
    screen.getByRole('button', { name: OPTIONS.help(OPTIONS.promptText.label) }).focus();
    await waitFor(() => expect(screen.getByText(OPTIONS.storageRawOnly(1))).toBeTruthy());
    screen.getByRole('button', { name: OPTIONS.help(OPTIONS.toolDetails.label) }).focus();
    await waitFor(() => expect(screen.getByText(OPTIONS.storageNone)).toBeTruthy());
  });

  it('shows the rotate notice only for a rotation', () => {
    const { unmount } = renderWithTheme(
      <SnippetModal open credential={credential} onClose={vi.fn()} onClosed={vi.fn()} />,
    );
    expect(screen.queryByText(OPTIONS.rotateNotice)).toBeNull();
    unmount();
    const retiring = { ...credential, credentials: [otelCredential(OTEL_STATUS.RETIRING)] };
    renderWithTheme(<SnippetModal open credential={retiring} onClose={vi.fn()} onClosed={vi.fn()} />);
    expect(screen.getByText(OPTIONS.rotateNotice)).toBeTruthy();
  });

  it('resets the options after the modal closes', async () => {
    const onClosed = vi.fn();
    const modal = (open: boolean) => (
      <SnippetModal open={open} credential={credential} onClose={vi.fn()} onClosed={onClosed} />
    );
    const { rerender } = renderWithTheme(modal(true));
    fireEvent.click(checkbox(OPTIONS.repository.label));
    expect(shownEnv().OTEL_METRICS_INCLUDE_REPOSITORY).toBe('false');
    rerender(modal(false));
    const dialog = document.querySelector<HTMLElement>('.ant-modal');
    await finishModalExit(dialog);
    expect(onClosed).toHaveBeenCalledOnce();
    rerender(modal(true));
    await waitFor(() => expect(checkbox(OPTIONS.repository.label).checked).toBe(true));
    expect(shownEnv()).toEqual(MANAGED_ENV);
  });

  it('updates the storage estimate as signals change', () => {
    renderWithTheme(<SnippetModal open credential={credential} onClose={vi.fn()} onClosed={vi.fn()} />);
    expect(screen.getByText(OPTIONS.estimate(73, 21))).toBeTruthy();
    fireEvent.click(checkbox(OPTIONS.logs.label));
    expect(screen.getByText(OPTIONS.estimate(20, 1))).toBeTruthy();
  });

  it('announces the estimate as a status, not an alert', () => {
    renderWithTheme(<SnippetModal open credential={credential} onClose={vi.fn()} onClosed={vi.fn()} />);
    const estimate = screen.getByText(OPTIONS.estimate(73, 21));
    expect(estimate.closest('[role="status"]')).not.toBeNull();
    expect(estimate.closest('[role="alert"]')).toBeNull();
  });

  it('explains what an option sends', async () => {
    renderWithTheme(<SnippetModal open credential={credential} onClose={vi.fn()} onClosed={vi.fn()} />);
    screen.getByRole('button', { name: OPTIONS.help(OPTIONS.logs.label) }).focus();
    await waitFor(() => expect(screen.getByText(OPTIONS.logs.details[0])).toBeTruthy());
    expect(screen.getByText(OPTIONS.storage(42, 17))).toBeTruthy();
  });
});
