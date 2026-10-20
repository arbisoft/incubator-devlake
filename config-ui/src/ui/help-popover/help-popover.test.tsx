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
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { HelpPopover } from './help-popover';

const LABEL = 'About this option';
const CONTENT = 'Helpful details';
const LEAVE_CLASS = 'ant-zoom-big-leave';

const popover = () => screen.getByText(CONTENT).closest('.ant-popover');
const button = () => screen.getByRole('button', { name: LABEL });

describe('HelpPopover', () => {
  it('keeps the content hidden until triggered', () => {
    renderWithTheme(<HelpPopover label={LABEL} content={CONTENT} />);
    expect(screen.queryByText(CONTENT)).toBeNull();
  });

  it('shows the content on focus', async () => {
    renderWithTheme(<HelpPopover label={LABEL} content={CONTENT} />);
    button().focus();
    await waitFor(() => expect(screen.getByText(CONTENT)).toBeTruthy());
  });

  it('opens on hover', async () => {
    renderWithTheme(<HelpPopover label={LABEL} content={CONTENT} />);
    fireEvent.mouseEnter(button());
    await waitFor(() => expect(screen.getByText(CONTENT)).toBeTruthy());
  });

  it('opens on click', async () => {
    renderWithTheme(<HelpPopover label={LABEL} content={CONTENT} />);
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByText(CONTENT)).toBeTruthy());
  });

  it('stays open when clicked after hovering', async () => {
    renderWithTheme(<HelpPopover label={LABEL} content={CONTENT} />);
    fireEvent.mouseEnter(button());
    await waitFor(() => expect(screen.getByText(CONTENT)).toBeTruthy());
    fireEvent.click(button());
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(popover()?.className).not.toContain(LEAVE_CLASS);
  });

  it('links the open content to the button', async () => {
    renderWithTheme(<HelpPopover label={LABEL} content={CONTENT} />);
    button().focus();
    await waitFor(() => expect(screen.getByText(CONTENT)).toBeTruthy());
    const id = button().getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(id)?.textContent).toContain(CONTENT);
  });

  it('closes on blur', async () => {
    renderWithTheme(<HelpPopover label={LABEL} content={CONTENT} />);
    button().focus();
    await waitFor(() => expect(screen.getByText(CONTENT)).toBeTruthy());
    expect(popover()?.className).not.toContain(LEAVE_CLASS);
    button().blur();
    await waitFor(() => expect(popover()?.className).toContain(LEAVE_CLASS));
  });
});
