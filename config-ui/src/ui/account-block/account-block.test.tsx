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
import { describe, expect, it } from 'vitest';

import { getTheme } from '@/theme/tokens';
import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { AccountBlock } from './account-block';
import { getMenuTheme } from './utils';

describe('getMenuTheme', () => {
  it.each(['light', 'dark'] as const)('draws the popup from the %s sidebar tokens', (mode) => {
    const { sidebar, shadow } = getTheme(mode);
    expect(getMenuTheme(sidebar, shadow).token).toMatchObject({
      colorBgElevated: sidebar.bg,
      colorText: sidebar.text,
      controlItemBgHover: sidebar.itemHoverBg,
    });
  });
});

describe('AccountBlock', () => {
  it('opens the menu with its items from the trigger', async () => {
    renderWithTheme(
      <AccountBlock
        name="Ada Lovelace"
        secondary="Admin"
        collapsed={false}
        menu={[{ key: 'out', label: 'Sign out' }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    expect(await screen.findByText('Sign out')).toBeTruthy();
  });
});
