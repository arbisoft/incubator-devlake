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

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import API from '@/api';
import type { GrafanaOrphan } from '@/api/grafana-users/types';
import { createDeferred } from '@/routes/settings/__tests__/test-utils';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { COPY } from '../../constants';
import { OrphansModal } from '../orphans-modal';

const grafana = vi.mocked(API.grafanaUsers);
const MODAL_SELECTOR = '.ant-modal';
const REVIEW = 'Review orphans';
const PARENT_STATE = { OPEN: 'parent open', CLOSED: 'parent closed' } as const;
const copy = COPY.orphansDialog;
const ACCOUNT_A = 'a-gone@example.com';
const ACCOUNT_B = 'b-gone@example.com';
const orphan = (account: string): GrafanaOrphan => ({ account, projects: ['alpha'] });
const BOTH = [orphan(ACCOUNT_A), orphan(ACCOUNT_B)];

const Parent = ({ orphans, onChanged }: { orphans: GrafanaOrphan[]; onChanged: () => void }) => {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {REVIEW}
      </button>
      <output>{open ? PARENT_STATE.OPEN : PARENT_STATE.CLOSED}</output>
      <OrphansModal open={open} orphans={orphans} onClose={() => setOpen(false)} onChanged={onChanged} />
    </>
  );
};

const show = (orphans: GrafanaOrphan[]) => {
  const onChanged = vi.fn();
  const view = renderWithTheme(<Parent orphans={orphans} onChanged={onChanged} />);
  return {
    onChanged,
    update: (next: GrafanaOrphan[]) => view.rerender(<Parent orphans={next} onChanged={onChanged} />),
  };
};

const clearButton = (account: string) => screen.getByRole('button', { name: copy.clearFor(account) });
const confirmButton = (account: string) => {
  const dialog = screen.getByText(copy.confirm.title(account)).closest(MODAL_SELECTOR) as HTMLElement;
  return within(dialog).getByRole('button', { name: new RegExp(`${copy.confirm.confirm}$`) });
};
const requestClear = async (account: string) => {
  fireEvent.click(clearButton(account));
  await screen.findByText(copy.confirm.title(account));
};
const confirmClear = async (account: string) => {
  await requestClear(account);
  fireEvent.click(confirmButton(account));
};
const waitForParent = (state: string) => waitFor(() => expect(screen.getByRole('status').textContent).toBe(state));
const waitForButtonReady = (button: HTMLElement) =>
  waitFor(() => expect(button.classList.contains('ant-btn-loading')).toBe(false));

describe('OrphansModal lifecycle', () => {
  it('closes its parent when opened with nothing to review and stays closed when orphans arrive later', async () => {
    const { update } = show([]);
    await waitForParent(PARENT_STATE.CLOSED);
    update(BOTH);
    expect(screen.queryByText(copy.title)).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(PARENT_STATE.CLOSED);

    fireEvent.click(screen.getByRole('button', { name: REVIEW }));
    expect(await screen.findByText(ACCOUNT_A)).toBeTruthy();
  });

  it('sends one request for a repeated confirmation, disables the clearing row and ignores another row', async () => {
    const deferred = createDeferred();
    grafana.clearOrphan.mockReturnValueOnce(deferred.promise);
    const { onChanged } = show(BOTH);
    await requestClear(ACCOUNT_A);
    const confirm = confirmButton(ACCOUNT_A);
    await act(async () => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    try {
      expect(grafana.clearOrphan).toHaveBeenCalledTimes(1);
      expect((clearButton(ACCOUNT_A) as HTMLButtonElement).disabled).toBe(true);

      fireEvent.click(clearButton(ACCOUNT_B));
      expect(screen.queryByText(copy.confirm.title(ACCOUNT_B))).toBeNull();
      expect(screen.getByText(copy.confirm.title(ACCOUNT_A))).toBeTruthy();
      expect(grafana.clearOrphan).toHaveBeenCalledTimes(1);
    } finally {
      deferred.resolve();
    }
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(grafana.clearOrphan).toHaveBeenCalledWith(ACCOUNT_A);
  });

  it('hides a cleared account while props are stale, closes after the last one and does not clear it again', async () => {
    const { onChanged, update } = show([orphan(ACCOUNT_A)]);
    await confirmClear(ACCOUNT_A);
    await waitForParent(PARENT_STATE.CLOSED);
    expect(onChanged).toHaveBeenCalledTimes(1);

    update(BOTH);
    fireEvent.click(screen.getByRole('button', { name: REVIEW }));
    expect(await screen.findByText(ACCOUNT_B)).toBeTruthy();
    expect(screen.queryByText(ACCOUNT_A)).toBeNull();
    expect(grafana.clearOrphan).toHaveBeenCalledTimes(1);
  });

  it('hides only the cleared account, keeps the rest available and survives closing and reopening', async () => {
    show(BOTH);
    await confirmClear(ACCOUNT_A);
    await waitFor(() => expect(screen.queryByText(ACCOUNT_A)).toBeNull());
    expect((clearButton(ACCOUNT_B) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getAllByRole('button', { name: copy.close }).at(-1) as HTMLElement);
    await waitForParent(PARENT_STATE.CLOSED);
    fireEvent.click(screen.getByRole('button', { name: REVIEW }));
    expect(await screen.findByText(ACCOUNT_B)).toBeTruthy();
    expect(screen.queryByText(ACCOUNT_A)).toBeNull();
  });

  it('keeps a failed account listed, refreshes, and clears it on retry', async () => {
    grafana.clearOrphan.mockRejectedValueOnce(new Error('boom'));
    const { onChanged } = show(BOTH);
    await confirmClear(ACCOUNT_A);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(screen.getByText(ACCOUNT_A)).toBeTruthy();
    expect(screen.getByText(copy.confirm.title(ACCOUNT_A))).toBeTruthy();

    await waitForButtonReady(confirmButton(ACCOUNT_A));
    fireEvent.click(confirmButton(ACCOUNT_A));
    await waitFor(() => expect(screen.queryByText(ACCOUNT_A)).toBeNull());
    expect(grafana.clearOrphan).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('shows an account again when a fresh list omits it and a later list recreates it', async () => {
    const { update } = show(BOTH);
    await confirmClear(ACCOUNT_A);
    await waitFor(() => expect(screen.queryByText(ACCOUNT_A)).toBeNull());

    update([orphan(ACCOUNT_B)]);
    update(BOTH);
    expect(await screen.findByText(ACCOUNT_A)).toBeTruthy();
    expect((clearButton(ACCOUNT_A) as HTMLButtonElement).disabled).toBe(false);
  });
});
