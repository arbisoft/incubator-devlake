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

import { RemoteLink } from './remote-link';

const patterns = [
  { pattern: 'https://one/{repo}', regex: 'one-regex' },
  { pattern: 'https://two/{repo}', regex: 'two-regex' },
];

describe('RemoteLink', () => {
  it('keeps the remaining row and payload when the first row is deleted', () => {
    const setTransformation = vi.fn();
    renderWithTheme(
      <RemoteLink transformation={{ remotelinkRepoPattern: patterns }} setTransformation={setTransformation} />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /close/i })[0]);

    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(1);
    expect((inputs[0] as HTMLInputElement).value).toBe('https://two/{repo}');
    expect(setTransformation).toHaveBeenLastCalledWith({ remotelinkRepoPattern: [patterns[1]] });
  });

  it('adds an empty row without adding it to the payload', () => {
    const setTransformation = vi.fn();
    renderWithTheme(
      <RemoteLink transformation={{ remotelinkRepoPattern: [patterns[0]] }} setTransformation={setTransformation} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add a pattern/i }));

    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(setTransformation).toHaveBeenLastCalledWith({ remotelinkRepoPattern: [patterns[0]] });
  });

  const deleteFirstWhileSecondFocused = () => {
    renderWithTheme(<RemoteLink transformation={{ remotelinkRepoPattern: patterns }} setTransformation={vi.fn()} />);

    const [, second] = screen.getAllByRole('textbox');
    second.focus();
    fireEvent.focus(second);
    fireEvent.click(screen.getAllByRole('button', { name: /close/i })[0]);
    return second;
  };

  it('keeps focus on the remaining row when an earlier row is deleted', () => {
    const second = deleteFirstWhileSecondFocused();

    expect(second.isConnected).toBe(true);
    expect(document.activeElement).toBe(second);
  });

  it('edits the remaining row after an earlier row is deleted while the later row was focused', () => {
    const second = deleteFirstWhileSecondFocused();
    fireEvent.change(second, { target: { value: 'https://edited/{repo}' } });

    expect((second as HTMLInputElement).value).toBe('https://edited/{repo}');
  });
});
