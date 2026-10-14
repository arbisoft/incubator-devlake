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
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { DetailDrawer } from './detail-drawer';

const TITLE = 'Event detail';

describe('DetailDrawer', () => {
  it('shows its title and content while open', () => {
    renderWithTheme(
      <DetailDrawer open title={TITLE} onClose={vi.fn()}>
        <p>body</p>
      </DetailDrawer>,
    );
    expect(screen.getByRole('dialog', { name: TITLE })).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('returns focus to the element that opened it once it has closed', async () => {
    const Harness = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>opener</button>
          <DetailDrawer open={open} title={TITLE} onClose={() => setOpen(false)}>
            <button onClick={() => setOpen(false)}>close it</button>
          </DetailDrawer>
        </>
      );
    };
    renderWithTheme(<Harness />);
    const opener = screen.getByRole('button', { name: 'opener' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(await screen.findByRole('button', { name: 'close it' }));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});
