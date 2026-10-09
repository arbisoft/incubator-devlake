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
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '@/ui/__tests__/render-with-theme';

import { CodeBlock } from './code-block';
import { CODE_LANGUAGE } from './constants';

const COMMAND = "curl https://example.com -X 'POST'\n  -d '{}'";
const COPY_LABEL = 'Copy command';

describe('CodeBlock single line', () => {
  it('shows the full text in a tooltip on focus', async () => {
    renderWithTheme(<CodeBlock value={COMMAND} language={CODE_LANGUAGE.SHELL} copyLabel={COPY_LABEL} singleLine />);
    fireEvent.mouseEnter(screen.getByLabelText('Code'));
    expect((await screen.findByRole('tooltip')).textContent).toBe(COMMAND);
  });

  it('copies the full text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderWithTheme(<CodeBlock value={COMMAND} language={CODE_LANGUAGE.SHELL} copyLabel={COPY_LABEL} singleLine />);
    fireEvent.click(screen.getByRole('button', { name: COPY_LABEL }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(COMMAND));
  });
});
